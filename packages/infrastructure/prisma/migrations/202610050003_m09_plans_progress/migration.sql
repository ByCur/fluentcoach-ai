-- M09 forward-only. UTC is an explicit legacy snapshot where historical timezone is unknowable.
ALTER TABLE conversation_turns ADD CONSTRAINT turns_id_account_session_key UNIQUE(id,account_id,session_id);
CREATE TABLE practice_events (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 session_id UUID NOT NULL, turn_id UUID, source_key VARCHAR(110) NOT NULL,
 kind VARCHAR(20) NOT NULL CHECK(kind IN ('voice','text','session-completed')),
 duration_ms INTEGER NOT NULL CHECK(duration_ms BETWEEN 0 AND 300000),
 occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(), timezone_at_event VARCHAR(64) NOT NULL,
 local_date DATE NOT NULL,
 FOREIGN KEY(session_id,account_id) REFERENCES practice_sessions(id,account_id) ON DELETE CASCADE,
 FOREIGN KEY(turn_id,account_id,session_id) REFERENCES conversation_turns(id,account_id,session_id) ON DELETE CASCADE,
 UNIQUE(account_id,session_id,source_key),
 CHECK((kind='session-completed' AND turn_id IS NULL AND duration_ms=0) OR (kind IN ('voice','text') AND turn_id IS NOT NULL)),
 CHECK(kind<>'voice' OR duration_ms BETWEEN 1 AND 30000),
 CHECK(local_date=(occurred_at AT TIME ZONE timezone_at_event)::date)
);
CREATE INDEX practice_events_account_date_idx ON practice_events(account_id,local_date);
CREATE FUNCTION progress_event_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 RAISE EXCEPTION 'practice events are immutable' USING ERRCODE='55000'; END $$;
CREATE TRIGGER practice_events_no_update BEFORE UPDATE ON practice_events FOR EACH ROW EXECUTE FUNCTION progress_event_immutable();
CREATE FUNCTION session_completion_progress() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE zone TEXT; instant TIMESTAMPTZ; BEGIN
 IF NEW.state='ENDED' AND (TG_OP='INSERT' OR OLD.state IS DISTINCT FROM NEW.state) THEN
 SELECT timezone INTO zone FROM learner_profiles WHERE account_id=NEW.account_id;
 instant:=clock_timestamp();
 INSERT INTO practice_events(account_id,session_id,source_key,kind,duration_ms,occurred_at,timezone_at_event,local_date)
 VALUES(NEW.account_id,NEW.id,'session-completed','session-completed',0,instant,zone,(instant AT TIME ZONE zone)::date) ON CONFLICT DO NOTHING;
 END IF; RETURN NEW; END $$;
CREATE TRIGGER session_completion_progress AFTER INSERT OR UPDATE OF state ON practice_sessions FOR EACH ROW EXECUTE FUNCTION session_completion_progress();
INSERT INTO practice_events(account_id,session_id,source_key,kind,duration_ms,occurred_at,timezone_at_event,local_date)
 SELECT account_id,id,'session-completed','session-completed',0,COALESCE(ended_at,created_at),'UTC',(COALESCE(ended_at,created_at) AT TIME ZONE 'UTC')::date FROM practice_sessions WHERE state='ENDED';
ALTER TABLE vocabulary_review_events ADD COLUMN timezone_at_event VARCHAR(64), ADD COLUMN local_date DATE;
ALTER TABLE vocabulary_review_events DISABLE TRIGGER vocabulary_review_no_update;
UPDATE vocabulary_review_events SET timezone_at_event='UTC',local_date=(reviewed_at AT TIME ZONE 'UTC')::date;
ALTER TABLE vocabulary_review_events ENABLE TRIGGER vocabulary_review_no_update;
ALTER TABLE vocabulary_review_events ALTER COLUMN timezone_at_event SET NOT NULL, ALTER COLUMN local_date SET NOT NULL;
ALTER TABLE vocabulary_review_events ADD CONSTRAINT review_event_date_check CHECK(local_date=(reviewed_at AT TIME ZONE timezone_at_event)::date);
CREATE FUNCTION review_progress_date() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 SELECT timezone INTO NEW.timezone_at_event FROM learner_profiles WHERE account_id=NEW.account_id;
 NEW.local_date:=(NEW.reviewed_at AT TIME ZONE NEW.timezone_at_event)::date; RETURN NEW; END $$;
CREATE TRIGGER review_progress_date BEFORE INSERT ON vocabulary_review_events FOR EACH ROW EXECUTE FUNCTION review_progress_date();
CREATE TABLE learning_plans (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 schema_version VARCHAR(40) NOT NULL CHECK(schema_version='plan-v1'), generator_version VARCHAR(40) NOT NULL CHECK(generator_version='plan-generator-v1'),
 catalog_version VARCHAR(40) NOT NULL CHECK(catalog_version='plan-catalog-v1'), version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 state VARCHAR(12) NOT NULL DEFAULT 'proposal' CHECK(state IN ('proposal','active','superseded','replaced')),
 source_snapshot JSONB NOT NULL, rationale TEXT NOT NULL, insufficient_data BOOLEAN NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), accepted_at TIMESTAMPTZ, accepted_from_version INTEGER,
 UNIQUE(id,account_id),
 CHECK((state IN ('active','superseded') AND accepted_at IS NOT NULL AND accepted_from_version IS NOT NULL) OR (state IN ('proposal','replaced') AND accepted_at IS NULL AND accepted_from_version IS NULL))
);
CREATE UNIQUE INDEX learning_plans_one_proposal ON learning_plans(account_id) WHERE state='proposal';
CREATE UNIQUE INDEX learning_plans_one_active ON learning_plans(account_id) WHERE state='active';
CREATE TABLE learning_plan_activities (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), account_id UUID NOT NULL, plan_id UUID NOT NULL,
 catalog_version VARCHAR(40) NOT NULL CHECK(catalog_version='plan-catalog-v1'), candidate_id VARCHAR(100) NOT NULL,
 activity_type VARCHAR(30) NOT NULL CHECK(activity_type IN ('conversation','recurring-issue-practice','vocabulary-review')),
 definition JSONB NOT NULL, state VARCHAR(12) NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','started','completed','skipped','unavailable')),
 started_at TIMESTAMPTZ, session_id UUID, skipped_from_version INTEGER,
 FOREIGN KEY(plan_id,account_id) REFERENCES learning_plans(id,account_id) ON DELETE CASCADE,
 FOREIGN KEY(session_id,account_id) REFERENCES practice_sessions(id,account_id) ON DELETE SET NULL (session_id),
 UNIQUE(plan_id,candidate_id), UNIQUE(id,account_id), UNIQUE(session_id),
 CHECK(jsonb_typeof(definition)='object' AND definition->>'type'=activity_type)
);
CREATE TABLE learning_plan_requests (
 account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, request_key VARCHAR(100) NOT NULL,
 plan_id UUID NOT NULL, signature TEXT NOT NULL,
 FOREIGN KEY(plan_id,account_id) REFERENCES learning_plans(id,account_id) ON DELETE CASCADE,
 PRIMARY KEY(account_id,request_key)
);

-- Keep profile/goal snapshots current until the account-owned event/plan transaction commits.
-- Existing identity writers are single-statement operations; this trigger joins their writes
-- to the M07/M08/M09 account mutex without rewriting historical event dates.
CREATE FUNCTION m09_learner_snapshot_lock() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 PERFORM id FROM accounts WHERE id=NEW.account_id FOR UPDATE;
 RETURN NEW; END $$;
CREATE TRIGGER m09_profile_snapshot_lock BEFORE INSERT OR UPDATE ON learner_profiles
 FOR EACH ROW EXECUTE FUNCTION m09_learner_snapshot_lock();
CREATE TRIGGER m09_goal_snapshot_lock BEFORE INSERT OR UPDATE ON practice_goals
 FOR EACH ROW EXECUTE FUNCTION m09_learner_snapshot_lock();
