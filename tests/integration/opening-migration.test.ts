import {readFile, readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {expect, it} from 'vitest';

it('upgrades completion progress without rewriting history, preserves old SQL and retains the five-session safety cap', async () => {
  const db = new pg.Pool({connectionString: process.env['DATABASE_URL']}), c = await db.connect();
  const schema = 'opening_upgrade_' + randomUUID().replaceAll('-', ''), root = 'packages/infrastructure/prisma/migrations', migration = '202610070001_tutor_opening_progress';
  try {
    await c.query(`CREATE SCHEMA ${schema}`);
    await c.query(`SET search_path TO ${schema},public`);
    for (const name of (await readdir(root)).filter(n => n.startsWith('2026') && n < migration).sort()) await c.query(await readFile(`${root}/${name}/migration.sql`, 'utf8'));
    const owner = (await c.query<{id: string}>("INSERT INTO accounts(oidc_issuer,oidc_subject) VALUES('synthetic','opening-upgrade') RETURNING id")).rows[0]!.id;
    await c.query("INSERT INTO learner_profiles(account_id,interface_language,native_language,timezone,cefr_level,interests) VALUES($1,'es','es','UTC','A2','{}')", [owner]);
    const start = async () => (await c.query<{id: string}>("INSERT INTO practice_sessions(account_id,profile_id,scenario_slug,scenario_version,level,mode,prompt_version) SELECT $1,id,'hotel',1,'A2','NATURAL','tutor-v4' FROM learner_profiles WHERE account_id=$1 RETURNING id", [owner])).rows[0]!.id;
    const end = (id: string) => c.query("UPDATE practice_sessions SET state='ENDED' WHERE id=$1 AND account_id=$2", [id, owner]);
    await end(await start());
    const history = (await c.query('SELECT * FROM practice_events WHERE account_id=$1', [owner])).rows;
    await c.query(await readFile(`${root}/${migration}/migration.sql`, 'utf8'));
    expect((await c.query('SELECT * FROM practice_events WHERE account_id=$1', [owner])).rows).toEqual(history);
    const opener = await start();
    await c.query("INSERT INTO conversation_turns(account_id,session_id,sequence,source_event_key,speaker,text,language) VALUES($1,$2,1,'tutor-opening:v1','tutor','Hello! Do you have a reservation?','en')", [owner, opener]);
    await c.query("INSERT INTO session_events(account_id,session_id,sequence,kind,payload) VALUES($1,$2,1,'opening.requested','{}')", [owner, opener]);
    await end(opener);
    expect((await c.query('SELECT * FROM practice_events WHERE session_id=$1', [opener])).rows).toEqual([]);
    // Previous image's ordinary session SQL remains compatible.
    const legacy = await start(); await end(legacy);
    expect((await c.query('SELECT kind FROM practice_events WHERE session_id=$1', [legacy])).rows).toEqual([{kind: 'session-completed'}]);
    for (let n = 0; n < 5; n++) await start();
    await expect(start()).rejects.toThrow('OPEN_SESSION_LIMIT');
    expect((await c.query('SELECT text FROM conversation_turns WHERE session_id=$1', [opener])).rows).toEqual([{text: 'Hello! Do you have a reservation?'}]);
  } finally {
    await c.query('SET search_path TO public'); await c.query(`DROP SCHEMA ${schema} CASCADE`); c.release(); await db.end();
  }
});
