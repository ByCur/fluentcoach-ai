import { pool } from './prisma.js';
export const M05_MIGRATION = '202609300004_m05_reports';
export const M02_MIGRATION = '202609290001_m02_identity';
const requiredColumns = [
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
      'SELECT 1 FROM _prisma_migrations WHERE migration_name IN ($1,$2) AND finished_at IS NOT NULL AND rolled_back_at IS NULL',
      [M02_MIGRATION, M05_MIGRATION],
    );
    if (migration.rowCount !== 2) return false;
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
