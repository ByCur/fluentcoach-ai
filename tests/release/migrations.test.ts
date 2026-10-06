import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { expect, it } from 'vitest';
// This historical test verifies the M10 -> M11 drain upgrade specifically.
const RELEASE_MIGRATION = '202610060002_m11_release_control';
it('upgrades populated M10 without changing prior schema; M10 SQL can drain, resume and roll back safely',async()=>{
  if(!process.env['DATABASE_URL'])throw new Error('DATABASE_URL required');
  const db=new pg.Pool({connectionString:process.env['DATABASE_URL']}), c=await db.connect(), schema='m11_upgrade_'+randomUUID().replaceAll('-','');
  const root='packages/infrastructure/prisma/migrations';
  try {
    await c.query(`CREATE SCHEMA ${schema}`);await c.query(`SET search_path TO ${schema},public`);
    for(const name of (await readdir(root)).filter(n=>n.startsWith('2026')&&n<RELEASE_MIGRATION).sort())await c.query(await readFile(`${root}/${name}/migration.sql`,'utf8'));
    const a=(await c.query<{id:string}>("INSERT INTO accounts(oidc_issuer,oidc_subject) VALUES('synthetic','m11-upgrade') RETURNING id")).rows[0]!.id;
    await c.query("INSERT INTO learner_profiles(account_id,interface_language,native_language,timezone,cefr_level,interests) VALUES($1,'es','es','UTC','A2','{}')",[a]);
    const start=()=>c.query<{id:string}>("INSERT INTO practice_sessions(account_id,profile_id,scenario_slug,scenario_version,level,mode,prompt_version) SELECT $1,id,'hotel',1,'A2','NATURAL','tutor-v4' FROM learner_profiles WHERE account_id=$1 RETURNING id",[a]);
    const existing=(await start()).rows[0]!.id;
    await c.query("INSERT INTO conversation_turns(account_id,session_id,sequence,source_event_key,speaker,text,language) VALUES($1,$2,1,'before-release','learner','SYNTHETIC_RELEASE_HISTORY','en')",[a,existing]);
    const before=(await c.query('SELECT * FROM conversation_turns WHERE account_id=$1',[a])).rows;
    const columns=await c.query('SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema=$1 ORDER BY table_name,column_name',[schema]);
    await c.query(await readFile(`${root}/${RELEASE_MIGRATION}/migration.sql`,'utf8'));
    expect((await c.query('SELECT * FROM conversation_turns WHERE account_id=$1',[a])).rows).toEqual(before);
    const after=(await c.query("SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema=$1 AND table_name NOT IN ('release_control','qstash_publication_budgets') ORDER BY table_name,column_name",[schema])).rows;
    expect(after).toEqual(columns.rows);
    await c.query('UPDATE release_control SET draining=true');
    await expect(start()).rejects.toThrow('RELEASE_DRAINING');
    // Existing M10 SQL remains usable for completion, including with a previous image after this additive upgrade.
    await c.query(`UPDATE practice_sessions SET state='ENDED',ended_at=now() WHERE id=$1`,[existing]);
    expect((await c.query('SELECT state FROM practice_sessions WHERE id=$1',[existing])).rows[0]!.state).toBe('ENDED');
    await c.query('UPDATE release_control SET draining=false');expect((await start()).rows).toHaveLength(1);
    expect((await c.query('SELECT * FROM conversation_turns WHERE account_id=$1',[a])).rows).toEqual(before);
  } finally {await c.query('SET search_path TO public');await c.query(`DROP SCHEMA ${schema} CASCADE`);c.release();await db.end();}
});
