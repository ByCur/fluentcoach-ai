import { randomUUID } from 'node:crypto';
import { readFile,readdir } from 'node:fs/promises';
import pg from 'pg';
import { expect,it } from 'vitest';
it('upgrades populated M09 sources, preserves active history, resumes legacy revocation and removes orphan provider audits',async()=>{
 const db=new pg.Pool({connectionString:process.env['DATABASE_URL']}),c=await db.connect(),schema='m10_upgrade_'+randomUUID().replaceAll('-',''),root='packages/infrastructure/prisma/migrations';
 try{
  await c.query(`CREATE SCHEMA ${schema}`);await c.query(`SET search_path TO ${schema},public`);
  for(const name of (await readdir(root)).filter(n=>n.startsWith('2026')&&!n.includes('m10')).sort())await c.query(await readFile(`${root}/${name}/migration.sql`,'utf8'));
  const a=(await c.query<{id:string}>("INSERT INTO accounts(oidc_issuer,oidc_subject) VALUES('synthetic','upgrade') RETURNING id")).rows[0]!.id;
  const profile=(await c.query<{id:string}>("INSERT INTO learner_profiles(account_id,interface_language,native_language,timezone,cefr_level,interests) VALUES($1,'es','es','UTC','A2',ARRAY['UPGRADE_PRIVATE_MARKER']) RETURNING id",[a])).rows[0]!.id;
  const s=(await c.query<{id:string}>("INSERT INTO practice_sessions(account_id,profile_id,scenario_slug,scenario_version,level,mode,prompt_version,state,transcript_revision) VALUES($1,$2,'hotel',1,'A2','NATURAL','tutor-v4','ENDED',1) RETURNING id",[a,profile])).rows[0]!.id;
  await c.query("INSERT INTO conversation_turns(session_id,account_id,sequence,source_event_key,speaker,text,language) VALUES($1,$2,1,'synthetic-turn','learner','UPGRADE_PRIVATE_MARKER','en')",[s,a]);
  await c.query("INSERT INTO transcript_revisions(session_id,account_id,revision,source_key,content_hash,turns,partial) VALUES($1,$2,1,'finalization','synthetic-hash','[]',false)",[s,a]);
  const run=(await c.query<{id:string}>("INSERT INTO analysis_runs(session_id,account_id,transcript_revision,analyzer_version,status) VALUES($1,$2,1,'analysis-v2','SUCCEEDED') RETURNING id",[s,a])).rows[0]!.id;
  const report=(await c.query<{id:string}>("INSERT INTO session_reports(analysis_run_id,session_id,account_id,transcript_revision,schema_version,content) VALUES($1,$2,$3,1,'report-v1',$4) RETURNING id",[run,s,a,{schemaVersion:'report-v1',strengths:[],corrections:[]}])).rows[0]!.id;
  await c.query("INSERT INTO issue_observations(account_id,taxonomy_version,issue_key,label,category,session_id,report_id,analysis_run_id,transcript_revision,turn_sequence,evidence_start,evidence_end,quote,uncertainty,occurred_at) VALUES($1,'language-issues-v1','verb-tense','Tiempos verbales','grammar',$2,$3,$4,1,1,0,4,'UPGRADE_PRIVATE_MARKER','low',now())",[a,s,report,run]);
  const card=(await c.query<{id:string}>("INSERT INTO vocabulary_cards(account_id,phrase,normalized_phrase,normalized_sense,source_session_id,source_report_id,source_revision,scheduler_version,due_at) VALUES($1,'UPGRADE_PRIVATE_MARKER','upgrade_private_marker','',$2,$3,1,'vocab-scheduler-v1',now()) RETURNING id",[a,s,report])).rows[0]!.id;
  await c.query("INSERT INTO vocabulary_review_events(account_id,card_id,scheduler_version,review_key,previous_state,rating,reviewed_at,resulting_state,next_due_at) VALUES($1,$2,'vocab-scheduler-v1','synthetic-review','{}','good',now(),'{}',now())",[a,card]);
  const plan=(await c.query<{id:string}>("INSERT INTO learning_plans(account_id,schema_version,generator_version,catalog_version,source_snapshot,rationale,insufficient_data) VALUES($1,'plan-v1','plan-generator-v1','plan-catalog-v1','{}','UPGRADE_PRIVATE_MARKER',true) RETURNING id",[a])).rows[0]!.id;
  await c.query("INSERT INTO learning_plan_activities(account_id,plan_id,catalog_version,candidate_id,activity_type,definition) VALUES($1,$2,'plan-catalog-v1','conversation:hotel','conversation','{\"type\":\"conversation\"}')",[a,plan]);
  const legacy=(await c.query<{id:string}>("INSERT INTO accounts(oidc_issuer,oidc_subject,status) VALUES('synthetic','legacy-deleting','DELETING') RETURNING id")).rows[0]!.id;
  const orphan=randomUUID();await c.query("INSERT INTO provider_runs(account_id,operation,adapter,model,prompt_version,schema_version,outcome,latency_ms) VALUES($1,'conversation','fake','fake','tutor-v4','tutor-v1','succeeded',1)",[orphan]);
  const before=(await c.query('SELECT content FROM session_reports WHERE account_id=$1',[a])).rows;
  await c.query(await readFile(`${root}/202610060001_m10_privacy/migration.sql`,'utf8'));
  expect((await c.query('SELECT content FROM session_reports WHERE account_id=$1',[a])).rows).toEqual(before);
  for(const table of ['practice_sessions','conversation_turns','issue_observations','vocabulary_cards','vocabulary_review_events','learning_plans','learning_plan_activities','practice_events'])expect((await c.query(`SELECT 1 FROM ${table} WHERE account_id=$1`,[a])).rows,table).toHaveLength(1);
  expect((await c.query('SELECT deletion_epoch FROM accounts WHERE id=$1',[a])).rows[0]!.deletion_epoch).toBe(0);
  expect((await c.query('SELECT deletion_epoch FROM deletion_tombstones WHERE account_id=$1',[legacy])).rows[0]!.deletion_epoch).toBe(1);expect((await c.query('SELECT state FROM privacy_jobs WHERE account_id=$1',[legacy])).rows[0]!.state).toBe('pending');
  expect((await c.query('SELECT 1 FROM provider_runs WHERE account_id=$1',[orphan])).rows).toHaveLength(0);
 }finally{await c.query('SET search_path TO public');await c.query(`DROP SCHEMA ${schema} CASCADE`);c.release();await db.end();}
});
