import { pool } from './prisma.js';
export const M05_MIGRATION = '202609300004_m05_reports';
export const M02_MIGRATION = '202609290001_m02_identity';
export const M08_MIGRATION = '202610050002_m08_vocabulary_reviews';
const requiredMigrations = [
  M08_MIGRATION,
  '202610050001_m07_recurring_issues',
  M02_MIGRATION,
  '202609300001_m03_m04_hardening',
  M05_MIGRATION,
  '202609300005_m05_hardening_compatibility',
];
const requiredColumns = [
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
