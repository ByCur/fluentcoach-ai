-- Forward migration: do not rewrite already-applied M03/M04 migrations.
ALTER TABLE practice_sessions ADD CONSTRAINT practice_sessions_profile_account_fkey
  FOREIGN KEY(profile_id,account_id) REFERENCES learner_profiles(id,account_id) ON DELETE CASCADE;
ALTER TABLE analysis_runs ADD CONSTRAINT analysis_runs_session_account_fkey
  FOREIGN KEY(session_id,account_id) REFERENCES practice_sessions(id,account_id) ON DELETE CASCADE;
ALTER TABLE provider_runs ADD CONSTRAINT provider_runs_analysis_account_fkey
  FOREIGN KEY(analysis_run_id,account_id) REFERENCES analysis_runs(id,account_id) ON DELETE CASCADE;
ALTER TABLE outbox_events ADD CONSTRAINT outbox_events_session_account_fkey
  FOREIGN KEY(aggregate_id,account_id) REFERENCES practice_sessions(id,account_id) ON DELETE CASCADE;
CREATE UNIQUE INDEX provider_runs_analysis_run_id_key ON provider_runs(analysis_run_id);
CREATE TABLE transcript_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL, account_id UUID NOT NULL, revision INTEGER NOT NULL CHECK(revision>0),
  source_key VARCHAR(100) NOT NULL, content_hash VARCHAR(64) NOT NULL,
  turns JSONB NOT NULL, partial BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY(session_id,account_id) REFERENCES practice_sessions(id,account_id) ON DELETE CASCADE,
  UNIQUE(session_id,revision), UNIQUE(session_id,source_key), UNIQUE(session_id,content_hash)
);
-- Existing finalized sessions retain their original evidence and revision number.
INSERT INTO transcript_revisions(session_id,account_id,revision,source_key,content_hash,turns,partial)
SELECT s.id,s.account_id,s.transcript_revision,'finalization',
  encode(sha256(convert_to(t.turns::text,'UTF8')),'hex'),t.turns,s.state<>'ENDED'
FROM practice_sessions s CROSS JOIN LATERAL (
  SELECT COALESCE(jsonb_agg(jsonb_build_object('sequence',sequence,'sourceEventKey',source_event_key,
    'speaker',speaker,'text',text,'language',language) ORDER BY sequence),'[]'::jsonb) AS turns
  FROM conversation_turns WHERE session_id=s.id AND account_id=s.account_id
) t WHERE s.transcript_revision>0;

-- Remember equivalent-content source keys too, so their retries cannot change evidence.
CREATE TABLE transcript_revision_receipts (
  session_id UUID NOT NULL, account_id UUID NOT NULL, source_key VARCHAR(100) NOT NULL,
  revision INTEGER NOT NULL,
  PRIMARY KEY(session_id,source_key),
  FOREIGN KEY(session_id,account_id) REFERENCES practice_sessions(id,account_id) ON DELETE CASCADE,
  FOREIGN KEY(session_id,revision) REFERENCES transcript_revisions(session_id,revision) ON DELETE CASCADE
);
INSERT INTO transcript_revision_receipts(session_id,account_id,source_key,revision)
SELECT session_id,account_id,source_key,revision FROM transcript_revisions;
