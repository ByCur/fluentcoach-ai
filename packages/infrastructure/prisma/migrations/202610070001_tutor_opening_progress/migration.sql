-- Preserve existing history and the five-session cap. Opening receipts are not learner practice.
CREATE OR REPLACE FUNCTION session_completion_progress() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE zone TEXT; instant TIMESTAMPTZ; BEGIN
 IF NEW.state='ENDED' AND (TG_OP='INSERT' OR OLD.state IS DISTINCT FROM NEW.state)
 AND (
   NOT EXISTS(SELECT 1 FROM session_events e WHERE e.account_id=NEW.account_id AND e.session_id=NEW.id AND e.kind='opening.requested')
   OR EXISTS(SELECT 1 FROM practice_events p WHERE p.account_id=NEW.account_id AND p.session_id=NEW.id AND p.kind IN ('voice','text'))
 ) THEN
   SELECT timezone INTO zone FROM learner_profiles WHERE account_id=NEW.account_id;
   instant:=clock_timestamp();
   INSERT INTO practice_events(account_id,session_id,source_key,kind,duration_ms,occurred_at,timezone_at_event,local_date)
   VALUES(NEW.account_id,NEW.id,'session-completed','session-completed',0,instant,zone,(instant AT TIME ZONE zone)::date)
   ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
