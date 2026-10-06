import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { expect, it } from 'vitest';
it('upgrades populated legacy plans additively, preserving IDs/history and backfilling their order', async () => {
  const db = new pg.Pool({connectionString: process.env['DATABASE_URL']}), c = await db.connect();
  const schema = 'roadmap_upgrade_' + randomUUID().replaceAll('-','');
  const root = 'packages/infrastructure/prisma/migrations', migration = '202610060003_roadmap';
  try {
    await c.query(`CREATE SCHEMA ${schema}`);
    await c.query(`SET search_path TO ${schema},public`);
    for (const name of (await readdir(root)).filter(n => n.startsWith('2026') && n < migration).sort())
      await c.query(await readFile(`${root}/${name}/migration.sql`, 'utf8'));
    const account = (await c.query<{id: string}>("INSERT INTO accounts(oidc_issuer,oidc_subject) VALUES('synthetic','roadmap-upgrade') RETURNING id")).rows[0]!.id;
    const plan = (await c.query<{id: string}>("INSERT INTO learning_plans(account_id,schema_version,generator_version,catalog_version,source_snapshot,rationale,insufficient_data,state,accepted_at,accepted_from_version) VALUES($1,'plan-v1','plan-generator-v1','plan-catalog-v1','{}','synthetic',true,'active',now(),1) RETURNING id", [account])).rows[0]!.id;
    const definitions = ['conversation:travel','conversation:hotel'].map(candidateId => ({candidateId, type: 'conversation', title: 'Synthetic old activity', rationale: 'Synthetic', targetMinutes: 5}));
    for (const definition of definitions) await c.query("INSERT INTO learning_plan_activities(account_id,plan_id,catalog_version,candidate_id,activity_type,definition,state) VALUES($1,$2,'plan-catalog-v1',$3,'conversation',$4,'completed')", [account, plan, definition.candidateId, definition]);
    const before = (await c.query('SELECT id,definition,state FROM learning_plan_activities ORDER BY candidate_id')).rows;
    await c.query(await readFile(`${root}/${migration}/migration.sql`, 'utf8'));
    expect((await c.query('SELECT id,definition,state FROM learning_plan_activities ORDER BY position')).rows).toEqual(before);
    expect((await c.query('SELECT position,started_from_version FROM learning_plan_activities ORDER BY position')).rows).toEqual([{position: 0, started_from_version: null}, {position: 1, started_from_version: null}]);
    expect((await c.query('SELECT roadmap_signature,adapted_at FROM learning_plans')).rows[0]).toEqual({roadmap_signature: null, adapted_at: null});
    // Legacy SQL continues to write after upgrade; new catalog versions are accepted too.
    await c.query("UPDATE learning_plans SET version=version+1 WHERE id=$1", [plan]);
    await c.query("UPDATE learning_plans SET generator_version='plan-generator-v2',catalog_version='plan-catalog-v2' WHERE id=$1", [plan]);
  } finally {
    await c.query('SET search_path TO public');
    await c.query(`DROP SCHEMA ${schema} CASCADE`);
    c.release(); await db.end();
  }
});
