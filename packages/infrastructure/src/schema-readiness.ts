import { pool } from './prisma.js';
export const M05_MIGRATION = '202609300004_m05_reports';
export const M02_MIGRATION = '202609290001_m02_identity';
export const M08_MIGRATION = '202610050002_m08_vocabulary_reviews';
export const M09_MIGRATION = '202610050003_m09_plans_progress';
export const M10_MIGRATION = '202610060001_m10_privacy';
const requiredMigrations = [
 M10_MIGRATION,
  M09_MIGRATION,
  M08_MIGRATION,
  '202610050001_m07_recurring_issues',
  M02_MIGRATION,
  '202609300001_m03_m04_hardening',
  M05_MIGRATION,
  '202609300005_m05_hardening_compatibility',
];
const requiredColumns = [
 ['accounts','deletion_epoch'], ['practice_sessions','deletion_epoch'], ['analysis_runs','deletion_epoch'], ['learning_plans','deletion_epoch'],
 ...['id','account_id','kind','version','state','request_key','deletion_epoch','attempts','created_at','started_at','completed_at','error_code'].map(c=>['privacy_jobs',c]),
 ...['job_id','account_id','content','size_bytes','expires_at'].map(c=>['privacy_export_artifacts',c]),
 ...['account_id','deletion_epoch','requested_at','completed_at','protocol_version','schema_version'].map(c=>['deletion_tombstones',c]),
  ['learning_plans', 'id'],
  ['learning_plans', 'account_id'],
  ['learning_plans', 'schema_version'],
  ['learning_plans', 'generator_version'],
  ['learning_plans', 'catalog_version'],
  ['learning_plans', 'version'],
  ['learning_plans', 'state'],
  ['learning_plans', 'source_snapshot'],
  ['learning_plans', 'rationale'],
  ['learning_plans', 'insufficient_data'],
  ['learning_plans', 'created_at'],
  ['learning_plans', 'accepted_at'],
  ['learning_plans', 'accepted_from_version'],
  ['learning_plan_activities', 'id'],
  ['learning_plan_activities', 'account_id'],
  ['learning_plan_activities', 'plan_id'],
  ['learning_plan_activities', 'catalog_version'],
  ['learning_plan_activities', 'candidate_id'],
  ['learning_plan_activities', 'activity_type'],
  ['learning_plan_activities', 'definition'],
  ['learning_plan_activities', 'state'],
  ['learning_plan_activities', 'started_at'],
  ['learning_plan_activities', 'session_id'],
  ['learning_plan_activities', 'skipped_from_version'],
  ['learning_plan_requests', 'account_id'],
  ['learning_plan_requests', 'request_key'],
  ['learning_plan_requests', 'plan_id'],
  ['learning_plan_requests', 'signature'],
  ['practice_events', 'id'],
  ['practice_events', 'account_id'],
  ['practice_events', 'session_id'],
  ['practice_events', 'turn_id'],
  ['practice_events', 'source_key'],
  ['practice_events', 'kind'],
  ['practice_events', 'duration_ms'],
  ['practice_events', 'occurred_at'],
  ['practice_events', 'timezone_at_event'],
  ['practice_events', 'local_date'],
  ['vocabulary_review_events', 'timezone_at_event'],
  ['vocabulary_review_events', 'local_date'],
  ['issue_observations', 'quote'],
  ['issue_dismissals', 'restored_at'],
  ['vocabulary_suggestions', 'origin_version'],
  ['vocabulary_suggestions', 'source_available'],
  ['vocabulary_cards', 'scheduler_version'],
  ['vocabulary_cards', 'due_at'],
  ['vocabulary_cards', 'version'],
  ['vocabulary_review_events', 'review_key'],
  ['vocabulary_review_events', 'previous_state'],
  ['vocabulary_review_events', 'next_due_at'],
  ['accounts', 'oidc_issuer'],
  ['accounts', 'oidc_subject'],
  ['accounts', 'status'],
  ['learner_profiles', 'account_id'],
  ['learner_profiles', 'timezone'],
  ['learner_profiles', 'cefr_level'],
  ['practice_goals', 'account_id'],
  ['practice_goals', 'minutes_per_day'],
  ['consent_records', 'account_id'],
  ['consent_records', 'provider_disclosure_version'],
  ['practice_sessions', 'turn_lease_token'],
  ['transcript_revisions', 'turns'],
  ['transcript_revision_receipts', 'source_key'],
  ['analysis_runs', 'lease_token'],
  ['session_reports', 'content'],
  ['session_reports', 'transcript_revision'],
  ['provider_runs', 'input_tokens'],
  ['ai_daily_budgets', 'blocked'],
  ['ai_budget_reservations', 'reserved_tokens'],
] as const;
export async function schemaReady(): Promise<boolean> {
  try {
    const migration = await pool.query(
      `SELECT 1 FROM _prisma_migrations WHERE migration_name = ANY($1::text[])
       AND finished_at IS NOT NULL AND rolled_back_at IS NULL`,
      [requiredMigrations],
    );
    if (migration.rowCount !== requiredMigrations.length) return false;
    const values = requiredColumns
      .map((_, index) => `($${index * 2 + 1},$${index * 2 + 2})`)
      .join(',');
    const parameters = requiredColumns.flat();
    const result = await pool.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM information_schema.columns c JOIN (VALUES ${values}) AS required(table_name,column_name) USING(table_name,column_name) WHERE c.table_schema='public'`,
      parameters,
    );
    return result.rows[0]?.count === requiredColumns.length;
  } catch {
    return false;
  }
}
