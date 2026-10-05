-- Forward-only M08: learner-confirmed vocabulary and deterministic review history.
ALTER TABLE session_reports ADD CONSTRAINT session_reports_id_account_key UNIQUE(id,account_id);
CREATE TABLE vocabulary_suggestions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 phrase VARCHAR(160) NOT NULL, normalized_phrase VARCHAR(160) NOT NULL, meaning VARCHAR(1000), normalized_sense VARCHAR(1000) NOT NULL DEFAULT '',
 source_session_id UUID, source_report_id UUID, source_revision INTEGER,
 evidence JSONB NOT NULL, origin_version VARCHAR(40) NOT NULL CHECK(origin_version='vocabulary-suggestion-v1'),
 state VARCHAR(12) NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','confirmed','ignored','invalidated')),
 source_available BOOLEAN NOT NULL DEFAULT true, card_id UUID, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(account_id,source_report_id,normalized_phrase,normalized_sense), UNIQUE(id,account_id),
 FOREIGN KEY(source_session_id,account_id) REFERENCES practice_sessions(id,account_id),
 FOREIGN KEY(source_report_id,account_id) REFERENCES session_reports(id,account_id)
);
CREATE INDEX vocabulary_suggestions_account_state_idx ON vocabulary_suggestions(account_id,state,created_at,id);
CREATE TABLE vocabulary_cards (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 phrase VARCHAR(160) NOT NULL, normalized_phrase VARCHAR(160) NOT NULL, meaning VARCHAR(1000), normalized_sense VARCHAR(1000) NOT NULL DEFAULT '',
 source_suggestion_id UUID, source_session_id UUID, source_report_id UUID, source_revision INTEGER, source_available BOOLEAN NOT NULL DEFAULT true,
 state VARCHAR(12) NOT NULL DEFAULT 'active' CHECK(state IN ('active','suspended')),
 scheduler_version VARCHAR(40) NOT NULL CHECK(scheduler_version='vocab-scheduler-v1'), due_at TIMESTAMPTZ NOT NULL,
 interval_minutes INTEGER NOT NULL DEFAULT 0 CHECK(interval_minutes>=0 AND interval_minutes<=259200), repetitions INTEGER NOT NULL DEFAULT 0 CHECK(repetitions>=0),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(account_id,normalized_phrase,normalized_sense), UNIQUE(id,account_id),
 FOREIGN KEY(source_session_id,account_id) REFERENCES practice_sessions(id,account_id),
 FOREIGN KEY(source_report_id,account_id) REFERENCES session_reports(id,account_id)
);
ALTER TABLE vocabulary_suggestions ADD CONSTRAINT vocabulary_suggestion_card_fk FOREIGN KEY(card_id,account_id) REFERENCES vocabulary_cards(id,account_id);
CREATE INDEX vocabulary_cards_due_idx ON vocabulary_cards(account_id,state,due_at,id);
CREATE TABLE vocabulary_review_events (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), card_id UUID NOT NULL, account_id UUID NOT NULL,
 scheduler_version VARCHAR(40) NOT NULL CHECK(scheduler_version='vocab-scheduler-v1'), review_key VARCHAR(100) NOT NULL,
 previous_state JSONB NOT NULL, rating VARCHAR(10) NOT NULL CHECK(rating IN ('again','hard','good','easy')),
 reviewed_at TIMESTAMPTZ NOT NULL, resulting_state JSONB NOT NULL, next_due_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(card_id,account_id) REFERENCES vocabulary_cards(id,account_id) ON DELETE CASCADE,
 UNIQUE(account_id,review_key)
);
CREATE INDEX vocabulary_review_history_idx ON vocabulary_review_events(account_id,card_id,reviewed_at,id);
CREATE FUNCTION vocabulary_review_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 RAISE EXCEPTION 'vocabulary review events are immutable' USING ERRCODE='55000'; END $$;
CREATE TRIGGER vocabulary_review_no_update BEFORE UPDATE ON vocabulary_review_events
FOR EACH ROW EXECUTE FUNCTION vocabulary_review_immutable();

-- A deleted/superseded report invalidates pending proposals but preserves learner-owned cards with unavailable provenance.
CREATE FUNCTION vocabulary_report_deleted() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 UPDATE vocabulary_suggestions SET source_available=false,state=CASE WHEN state='pending' THEN 'invalidated' ELSE state END,source_report_id=NULL,source_revision=NULL,updated_at=now() WHERE account_id=OLD.account_id AND source_report_id=OLD.id;
 UPDATE vocabulary_cards SET source_available=false,source_report_id=NULL,source_revision=NULL,updated_at=now() WHERE account_id=OLD.account_id AND source_report_id=OLD.id;
 IF TG_OP='UPDATE' THEN RETURN NEW; END IF; RETURN OLD; END $$;
CREATE TRIGGER vocabulary_report_delete BEFORE DELETE ON session_reports FOR EACH ROW EXECUTE FUNCTION vocabulary_report_deleted();
CREATE TRIGGER vocabulary_report_supersede BEFORE UPDATE OF analysis_run_id,transcript_revision,content ON session_reports
FOR EACH ROW WHEN (OLD.analysis_run_id IS DISTINCT FROM NEW.analysis_run_id OR OLD.transcript_revision IS DISTINCT FROM NEW.transcript_revision OR OLD.content IS DISTINCT FROM NEW.content)
EXECUTE FUNCTION vocabulary_report_deleted();
CREATE FUNCTION vocabulary_session_deleted() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 UPDATE vocabulary_suggestions SET source_available=false,state=CASE WHEN state='pending' THEN 'invalidated' ELSE state END,source_session_id=NULL,updated_at=now() WHERE account_id=OLD.account_id AND source_session_id=OLD.id;
 UPDATE vocabulary_cards SET source_available=false,source_session_id=NULL,updated_at=now() WHERE account_id=OLD.account_id AND source_session_id=OLD.id;
 RETURN OLD; END $$;
CREATE TRIGGER vocabulary_session_delete BEFORE DELETE ON practice_sessions FOR EACH ROW EXECUTE FUNCTION vocabulary_session_deleted();
