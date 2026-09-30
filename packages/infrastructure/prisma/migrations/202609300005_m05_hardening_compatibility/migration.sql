-- M04's unique provider effect is retained. Its fake success was not a report;
-- preserve that historical audit as a session effect before generating M05 feedback.
UPDATE provider_runs p SET session_id=a.session_id,analysis_run_id=NULL
FROM analysis_runs a WHERE p.analysis_run_id=a.id AND p.account_id=a.account_id
AND p.operation='analysis' AND p.adapter='fake' AND p.prompt_version='analysis-v1'
AND a.analyzer_version='analysis-v2' AND a.status IN ('PENDING','SKIPPED');

-- Pending/failed/skipped M04 runs also use the current analyzer contract.
UPDATE analysis_runs SET analyzer_version='analysis-v2' WHERE analyzer_version='fake-v1';
