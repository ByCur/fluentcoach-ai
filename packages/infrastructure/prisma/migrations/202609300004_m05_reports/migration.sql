ALTER TABLE practice_sessions ADD COLUMN turn_lease_token UUID;
ALTER TABLE practice_sessions ADD COLUMN turn_lease_until TIMESTAMPTZ;
ALTER TABLE analysis_runs ADD COLUMN lease_token UUID;
ALTER TABLE analysis_runs ADD CONSTRAINT analysis_session_owner_fk FOREIGN KEY(session_id,account_id) REFERENCES practice_sessions(id,account_id) ON DELETE CASCADE;
ALTER TABLE analysis_runs ADD CONSTRAINT analysis_attempts_check CHECK(attempts>=0);
ALTER TABLE provider_runs ALTER COLUMN analysis_run_id DROP NOT NULL;
ALTER TABLE provider_runs ADD COLUMN session_id UUID;
ALTER TABLE provider_runs ADD COLUMN request_id VARCHAR(200);
ALTER TABLE provider_runs ADD COLUMN input_tokens INTEGER;
ALTER TABLE provider_runs ADD COLUMN output_tokens INTEGER;
ALTER TABLE provider_runs ADD COLUMN finish_reason VARCHAR(40);
ALTER TABLE provider_runs ADD CONSTRAINT provider_analysis_owner_fk FOREIGN KEY(analysis_run_id,account_id) REFERENCES analysis_runs(id,account_id) ON DELETE CASCADE;
ALTER TABLE provider_runs ADD CONSTRAINT provider_session_owner_fk FOREIGN KEY(session_id,account_id) REFERENCES practice_sessions(id,account_id) ON DELETE CASCADE;
CREATE TABLE session_reports(
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),analysis_run_id UUID NOT NULL UNIQUE,session_id UUID NOT NULL,account_id UUID NOT NULL,
 transcript_revision INTEGER NOT NULL,schema_version VARCHAR(40) NOT NULL,content JSONB NOT NULL,partial BOOLEAN NOT NULL DEFAULT false,
 generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(session_id,account_id),
 FOREIGN KEY(analysis_run_id,account_id) REFERENCES analysis_runs(id,account_id) ON DELETE CASCADE,
 FOREIGN KEY(session_id,account_id) REFERENCES practice_sessions(id,account_id) ON DELETE CASCADE,
 CHECK(schema_version='report-v1'),CHECK(octet_length(content::text)<=65536)
);
CREATE TABLE ai_daily_budgets(model VARCHAR(80) NOT NULL,day DATE NOT NULL,requests INTEGER NOT NULL CHECK(requests>=0),tokens INTEGER NOT NULL CHECK(tokens>=0),blocked BOOLEAN NOT NULL DEFAULT false,PRIMARY KEY(model,day));
CREATE TABLE ai_budget_reservations(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),model VARCHAR(80) NOT NULL,day DATE NOT NULL,reserved_tokens INTEGER NOT NULL CHECK(reserved_tokens>0),input_tokens INTEGER,output_tokens INTEGER,FOREIGN KEY(model,day)REFERENCES ai_daily_budgets(model,day));

-- M04 success represented a fake job effect, never an M05 feedback report.
-- Requeue usable current transcripts on upgrade; explicitly skip empty sessions.
UPDATE analysis_runs a SET analyzer_version='analysis-v2',status=CASE WHEN EXISTS(SELECT 1 FROM conversation_turns t WHERE t.session_id=a.session_id AND t.account_id=a.account_id AND t.speaker='learner') THEN 'PENDING'::"AnalysisStatus" ELSE 'SKIPPED'::"AnalysisStatus" END,attempts=0,lease_until=NULL,error_code=NULL
FROM practice_sessions s WHERE s.id=a.session_id AND s.account_id=a.account_id AND s.transcript_revision=a.transcript_revision AND a.status='SUCCEEDED';
UPDATE outbox_events o SET published_at=NULL FROM analysis_runs a WHERE o.payload->>'analysisRunId'=a.id::text AND a.status='PENDING' AND a.analyzer_version='analysis-v2';
