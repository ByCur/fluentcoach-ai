import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { pool } from '@fluentcoach/infrastructure';
it('upgrades nonempty M03/M04 data without rewriting deployed migrations or losing finalized evidence', async () => {
  const c=await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('CREATE SCHEMA synthetic_hardening_upgrade');
    await c.query('SET LOCAL search_path TO synthetic_hardening_upgrade,public');
    // Use the original deployed migrations, then apply the additive hardening migration.
    for (const name of ['202609290001_m02_identity','202609290002_m03_sessions','202609290003_m04_jobs']) await c.query(await readFile(`packages/infrastructure/prisma/migrations/${name}/migration.sql`,'utf8'));
    const a=(await c.query<{id:string}>("INSERT INTO accounts(oidc_issuer,oidc_subject) VALUES('synthetic','upgrade-a') RETURNING id")).rows[0]!.id;
    const p=(await c.query<{id:string}>("INSERT INTO learner_profiles(account_id,interface_language,native_language,timezone,cefr_level,interests) VALUES($1,'es','es','UTC','A2','{}') RETURNING id",[a])).rows[0]!.id;
    const s=(await c.query<{id:string}>("INSERT INTO practice_sessions(account_id,profile_id,scenario_slug,scenario_version,level,mode,prompt_version,state,ended_at,transcript_revision) VALUES($1,$2,'hotel',1,'A2','NATURAL','tutor-v1','ENDED',now(),1) RETURNING id",[a,p])).rows[0]!.id;
    await c.query("INSERT INTO conversation_turns(session_id,account_id,sequence,source_event_key,speaker,text,language) VALUES($1,$2,1,'learner-1','learner','Existing synthetic evidence','en')",[s,a]);
    await c.query("INSERT INTO analysis_runs(session_id,account_id,transcript_revision,analyzer_version) VALUES($1,$2,1,'fake-v1')",[s,a]);
    await c.query(await readFile('packages/infrastructure/prisma/migrations/202609300001_m03_m04_hardening/migration.sql','utf8'));
    const revision=(await c.query('SELECT revision,source_key,turns,partial FROM transcript_revisions')).rows[0]!;
    expect(revision).toEqual({revision:1,source_key:'finalization',turns:[{sequence:1,sourceEventKey:'learner-1',speaker:'learner',text:'Existing synthetic evidence',language:'en'}],partial:false});
    expect((await c.query('SELECT state,transcript_revision FROM practice_sessions')).rows[0]).toEqual({state:'ENDED',transcript_revision:1});
    const constraints=(await c.query<{conname:string}>("SELECT conname FROM pg_constraint WHERE connamespace='synthetic_hardening_upgrade'::regnamespace AND conname IN ('practice_sessions_profile_account_fkey','analysis_runs_session_account_fkey','provider_runs_analysis_account_fkey','outbox_events_session_account_fkey')")).rows;
    expect(constraints).toHaveLength(4);
  } finally { await c.query('ROLLBACK'); c.release(); }
},15000);
