-- Forward-only M07. Reports remain authoritative; observations can be rebuilt.
ALTER TABLE session_reports ADD CONSTRAINT report_observation_source_key
  UNIQUE(id,account_id,session_id,transcript_revision,analysis_run_id);
CREATE TABLE issue_observations (
  account_id UUID NOT NULL,
  taxonomy_version VARCHAR(40) NOT NULL CHECK(taxonomy_version='language-issues-v1'),
  issue_key VARCHAR(40) NOT NULL CHECK(issue_key IN ('verb-tense','subject-verb-agreement','articles','prepositions','word-order','vocabulary-choice','singular-plural','auxiliary-verbs')),
  label VARCHAR(80) NOT NULL, category VARCHAR(20) NOT NULL CHECK(category IN ('grammar','vocabulary')),
  session_id UUID NOT NULL, report_id UUID NOT NULL, analysis_run_id UUID NOT NULL,
  transcript_revision INTEGER NOT NULL CHECK(transcript_revision>0),
  turn_sequence INTEGER NOT NULL CHECK(turn_sequence>0),
  evidence_start INTEGER NOT NULL CHECK(evidence_start>=0),
  evidence_end INTEGER NOT NULL CHECK(evidence_end>evidence_start),
  quote TEXT NOT NULL CHECK(length(quote)>0 AND length(quote)<=2000),
  uncertainty VARCHAR(10) NOT NULL CHECK(uncertainty IN ('low','medium','high')),
  occurred_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY(account_id,taxonomy_version,issue_key,session_id,turn_sequence),
  FOREIGN KEY(report_id,account_id,session_id,transcript_revision,analysis_run_id)
    REFERENCES session_reports(id,account_id,session_id,transcript_revision,analysis_run_id) ON DELETE CASCADE,
  FOREIGN KEY(session_id,transcript_revision) REFERENCES transcript_revisions(session_id,revision) ON DELETE CASCADE
);
CREATE INDEX issue_observations_account_time_idx ON issue_observations(account_id,occurred_at);
CREATE TABLE issue_dismissals (
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  taxonomy_version VARCHAR(40) NOT NULL CHECK(taxonomy_version='language-issues-v1'),
  issue_key VARCHAR(40) NOT NULL CHECK(issue_key IN ('verb-tense','subject-verb-agreement','articles','prepositions','word-order','vocabulary-choice','singular-plural','auxiliary-verbs')),
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT now(), restored_at TIMESTAMPTZ,
  PRIMARY KEY(account_id,taxonomy_version,issue_key)
);
-- Derived view is never canonical. Time expiry and source deletion apply immediately.
CREATE VIEW recurring_issue_aggregates AS
SELECT o.account_id,o.taxonomy_version,o.issue_key,
  count(*)::int AS observation_count,count(DISTINCT o.session_id)::int AS session_count,
  min(o.occurred_at) AS first_occurred_at,max(o.occurred_at) AS last_occurred_at
FROM issue_observations o
JOIN session_reports r ON r.id=o.report_id AND r.account_id=o.account_id AND r.analysis_run_id=o.analysis_run_id AND r.transcript_revision=o.transcript_revision
JOIN practice_sessions s ON s.id=o.session_id AND s.account_id=o.account_id AND s.transcript_revision=o.transcript_revision AND s.state IN ('ENDED','ABANDONED','FAILED')
JOIN analysis_runs a ON a.id=o.analysis_run_id AND a.account_id=o.account_id AND a.session_id=o.session_id AND a.transcript_revision=o.transcript_revision AND a.status='SUCCEEDED'
JOIN accounts owner ON owner.id=o.account_id AND owner.status='ACTIVE'
WHERE o.occurred_at>=CURRENT_TIMESTAMP-interval '30 days' AND o.occurred_at<=CURRENT_TIMESTAMP
GROUP BY o.account_id,o.taxonomy_version,o.issue_key
HAVING count(*)>=3 AND count(DISTINCT o.session_id)>=2;
