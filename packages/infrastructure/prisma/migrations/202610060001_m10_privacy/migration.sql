-- Forward-only M10. No learner content or identity subject in operational ledger.
ALTER TABLE accounts ADD COLUMN deletion_epoch INTEGER NOT NULL DEFAULT 0 CHECK(deletion_epoch>=0);
ALTER TABLE practice_sessions ADD COLUMN deletion_epoch INTEGER NOT NULL DEFAULT 0 CHECK(deletion_epoch>=0);
ALTER TABLE analysis_runs ADD COLUMN deletion_epoch INTEGER NOT NULL DEFAULT 0 CHECK(deletion_epoch>=0);
ALTER TABLE learning_plans ADD COLUMN deletion_epoch INTEGER NOT NULL DEFAULT 0 CHECK(deletion_epoch>=0);
CREATE TABLE privacy_jobs (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), account_id UUID NOT NULL, kind VARCHAR(12) NOT NULL CHECK(kind IN ('export','deletion')),
 version VARCHAR(40) NOT NULL DEFAULT 'privacy-job-v1' CHECK(version='privacy-job-v1'),
 state VARCHAR(12) NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','completed','failed')),
 request_key UUID NOT NULL, deletion_epoch INTEGER NOT NULL CHECK(deletion_epoch>=0), attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, error_code VARCHAR(40),
 UNIQUE(account_id,kind,request_key), UNIQUE(id,account_id)
);
CREATE INDEX privacy_jobs_pending ON privacy_jobs(created_at) WHERE state='pending';
CREATE TABLE privacy_export_artifacts (
 job_id UUID PRIMARY KEY, account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 content JSONB NOT NULL, size_bytes INTEGER NOT NULL CHECK(size_bytes>0), expires_at TIMESTAMPTZ NOT NULL,
 FOREIGN KEY(job_id,account_id) REFERENCES privacy_jobs(id,account_id) ON DELETE CASCADE
);
CREATE INDEX privacy_artifact_expiry ON privacy_export_artifacts(expires_at);
CREATE TABLE deletion_tombstones (
 account_id UUID PRIMARY KEY, deletion_epoch INTEGER NOT NULL CHECK(deletion_epoch>0),
 requested_at TIMESTAMPTZ NOT NULL, completed_at TIMESTAMPTZ,
 protocol_version VARCHAR(40) NOT NULL CHECK(protocol_version='deletion-v1'),
 schema_version VARCHAR(40) NOT NULL CHECK(schema_version='deletion-tombstone-v1')
);
-- Preserve any legacy revocation and resume its cleanup under the new protocol.
UPDATE accounts SET deletion_epoch=1 WHERE status='DELETING';
INSERT INTO deletion_tombstones(account_id,deletion_epoch,requested_at,protocol_version,schema_version)
 SELECT id,deletion_epoch,now(),'deletion-v1','deletion-tombstone-v1' FROM accounts WHERE status='DELETING';
INSERT INTO privacy_jobs(account_id,kind,request_key,deletion_epoch)
 SELECT id,'deletion',gen_random_uuid(),deletion_epoch FROM accounts WHERE status='DELETING';
-- All learner writes serialize with canonical account state. Cleanup uses DELETE,
-- removing vocabulary before source cascades to avoid writes to deleting owners.
CREATE FUNCTION privacy_active_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner accounts%ROWTYPE; BEGIN
 -- FK/source-delete triggers may only remove references during cascading cleanup.
 -- These exceptions cannot insert content, change content, or restore availability.
 IF TG_OP='UPDATE' AND pg_trigger_depth()>1 THEN
  IF TG_TABLE_NAME='practice_events' THEN
   IF OLD.turn_id IS NOT NULL AND NEW.turn_id IS NULL AND (to_jsonb(OLD)-'turn_id')=(to_jsonb(NEW)-'turn_id') THEN RETURN NEW; END IF;
  END IF;
  IF TG_TABLE_NAME='learning_plan_activities' THEN
   IF OLD.session_id IS NOT NULL AND NEW.session_id IS NULL AND (to_jsonb(OLD)-'session_id')=(to_jsonb(NEW)-'session_id') THEN RETURN NEW; END IF;
  END IF;
  IF TG_TABLE_NAME IN ('vocabulary_suggestions','vocabulary_cards') THEN
   IF NEW.source_available=false AND (to_jsonb(OLD)-ARRAY['source_available','source_session_id','source_report_id','source_revision','state','updated_at'])=(to_jsonb(NEW)-ARRAY['source_available','source_session_id','source_report_id','source_revision','state','updated_at'])
    AND (NEW.source_session_id IS NULL OR NEW.source_session_id IS NOT DISTINCT FROM OLD.source_session_id)
    AND (NEW.source_report_id IS NULL OR NEW.source_report_id IS NOT DISTINCT FROM OLD.source_report_id)
    AND (NEW.source_revision IS NULL OR NEW.source_revision IS NOT DISTINCT FROM OLD.source_revision)
    AND (NEW.state IS NOT DISTINCT FROM OLD.state OR NEW.state='invalidated') THEN RETURN NEW; END IF;
  END IF;
 END IF;
 SELECT * INTO owner FROM accounts WHERE id=NEW.account_id FOR UPDATE;
 IF NOT FOUND OR owner.status<>'ACTIVE' THEN RAISE EXCEPTION 'ACCOUNT_DELETING' USING ERRCODE='55000'; END IF;
 IF TG_TABLE_NAME IN ('practice_sessions','analysis_runs','learning_plans') THEN
  IF NEW.deletion_epoch<>owner.deletion_epoch THEN RAISE EXCEPTION 'ACCOUNT_DELETING' USING ERRCODE='55000'; END IF;
 END IF;
 RETURN NEW; END $$;
DO $$ DECLARE tab TEXT; BEGIN
 FOREACH tab IN ARRAY ARRAY['learner_profiles','practice_goals','consent_records','practice_sessions','conversation_turns','session_events','transcript_revisions','transcript_revision_receipts','analysis_runs','session_reports','provider_runs','outbox_events','issue_observations','issue_dismissals','vocabulary_suggestions','vocabulary_cards','vocabulary_review_events','learning_plans','learning_plan_activities','learning_plan_requests','practice_events','privacy_export_artifacts'] LOOP
 EXECUTE format('CREATE TRIGGER privacy_active_write BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION privacy_active_write()',tab);
 END LOOP; END $$;
CREATE FUNCTION privacy_account_fence() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='INSERT' THEN
  IF EXISTS(SELECT 1 FROM deletion_tombstones WHERE account_id=NEW.id) THEN RAISE EXCEPTION 'ACCOUNT_DELETING' USING ERRCODE='55000'; END IF;
 ELSE
  IF NEW.status='DELETING' AND OLD.status<>'DELETING' THEN NEW.deletion_epoch:=GREATEST(NEW.deletion_epoch,OLD.deletion_epoch+1); END IF;
  IF NEW.deletion_epoch<OLD.deletion_epoch OR (OLD.status='DELETING' AND NEW.status<>'DELETING') OR (NEW.status='DELETING' AND OLD.status<>'DELETING' AND NEW.deletion_epoch<=OLD.deletion_epoch) THEN RAISE EXCEPTION 'ACCOUNT_DELETING' USING ERRCODE='55000'; END IF;
 END IF; RETURN NEW; END $$;
CREATE TRIGGER privacy_account_fence BEFORE INSERT OR UPDATE ON accounts FOR EACH ROW EXECUTE FUNCTION privacy_account_fence();
CREATE FUNCTION privacy_open_session_cap() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.state IN ('CREATED','ACTIVE') AND (TG_OP='INSERT' OR OLD.state NOT IN ('CREATED','ACTIVE')) THEN
 PERFORM 1 FROM accounts WHERE id=NEW.account_id FOR UPDATE;
 IF (SELECT count(*) FROM practice_sessions WHERE account_id=NEW.account_id AND state IN ('CREATED','ACTIVE'))>=5 THEN RAISE EXCEPTION 'OPEN_SESSION_LIMIT' USING ERRCODE='55000'; END IF;
 END IF; RETURN NEW; END $$;
CREATE TRIGGER privacy_open_session_cap BEFORE INSERT OR UPDATE OF state ON practice_sessions FOR EACH ROW EXECUTE FUNCTION privacy_open_session_cap();
-- Preserve content-free progress when transcript turns expire.
ALTER TABLE practice_events DROP CONSTRAINT practice_events_check;
ALTER TABLE practice_events ADD CHECK((kind='session-completed' AND turn_id IS NULL AND duration_ms=0) OR kind IN ('voice','text'));
-- FK-driven provenance invalidation may set turn_id NULL, but cannot change events.
CREATE OR REPLACE FUNCTION progress_event_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.turn_id IS NOT NULL AND NEW.turn_id IS NULL AND (to_jsonb(OLD)-'turn_id')=(to_jsonb(NEW)-'turn_id') AND current_setting('app.retention_policy',true)='retention-v1' THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'practice events are immutable' USING ERRCODE='55000'; END $$;
DELETE FROM provider_runs p WHERE NOT EXISTS(SELECT 1 FROM accounts a WHERE a.id=p.account_id);
ALTER TABLE provider_runs ADD FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE;
