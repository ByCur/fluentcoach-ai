import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { validateReleaseRuntime } from '../packages/infrastructure/src/release-policy.js';

async function main() {
  const [action, flag, environment, confirmation, sha] = process.argv.slice(2).filter(arg=>arg!=='--');
  if (!['migrate','drain','status','resume'].includes(action ?? '') || flag !== '--environment' || !environment || confirmation !== '--confirm-sha' || sha !== execFileSync('git', ['rev-parse','HEAD'], {encoding:'utf8'}).trim()) throw new Error('OPERATOR_CONFIRMATION_REQUIRED');
  validateReleaseRuntime({...process.env, APP_ENVIRONMENT:environment});
  // Current cloud topology is blocked above. Local operations are deliberately limited to disposable test DBs.
  const url = new URL(process.env['DATABASE_URL'] ?? '');
  if (!['localhost','127.0.0.1'].includes(url.hostname) || !url.pathname.endsWith('_test')) throw new Error('ISOLATED_DATABASE_REQUIRED');
  const pool = new pg.Pool({connectionString:url.href}), client = await pool.connect();
  try {
    const lock = await client.query<{locked:boolean}>('SELECT pg_try_advisory_lock(110011) AS locked');
    if (!lock.rows[0]?.locked) throw new Error('RELEASE_OPERATION_BUSY');
    if (action === 'migrate') {
      // Dedicated operator invocation; never part of API startup. Prisma records checksums/once-only completion.
      const result = await new Promise<number|null>((resolve,reject) => {
        const child = spawn('pnpm',['db:migrate:deploy'],{stdio:['ignore','ignore','ignore'],env:process.env});
        child.once('error',reject); child.once('close',resolve);
      });
      if (result !== 0) throw new Error('MIGRATION_FAILED');
    } else {
      if (action !== 'status') await client.query('UPDATE release_control SET draining=$1,changed_at=now() WHERE singleton',[action==='drain']);
      const status = await client.query<{draining:boolean;active_sessions:number;turn_leases:number;analysis_leases:number}>(`SELECT draining,
        (SELECT count(*)::int FROM practice_sessions WHERE state IN ('CREATED','ACTIVE')) AS active_sessions,
        (SELECT count(*)::int FROM practice_sessions WHERE turn_lease_until>now()) AS turn_leases,
        (SELECT count(*)::int FROM analysis_runs WHERE status='RUNNING' AND lease_until>now()) AS analysis_leases
        FROM release_control WHERE singleton`);
      if (!status.rows[0]) throw new Error('RELEASE_CONTROL_MISSING');
      console.log(JSON.stringify(status.rows[0]));
    }
  } finally { client.release(); await pool.end(); }
}
void main().catch(() => {console.error('RELEASE_OPERATION_REFUSED_OR_FAILED');process.exitCode=1;});
