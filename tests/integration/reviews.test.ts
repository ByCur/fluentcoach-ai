import { randomUUID } from 'node:crypto';
import { beforeEach,describe,expect,it } from 'vitest';
import { PostgresVocabularyRepository,sql } from '@fluentcoach/infrastructure';
import { vocabularyIdentity } from '@fluentcoach/domain';
import { vocabularySuggestionsFromReport,type AnalysisTranscript,type ReportDraft } from '@fluentcoach/application';
import { account,resetDatabase } from '../support/database.js';

type Source={suggestionId:string;sessionId:string;reportId:string};
const repo=new PostgresVocabularyRepository();

async function source(accountId:string,phrase='Take a seat',sense='Please sit down'):Promise<Source>{
  const profile=(await sql<{id:string}>('SELECT id FROM learner_profiles WHERE account_id=$1',[accountId]))[0]!.id;
  const sessionId=(await sql<{id:string}>("INSERT INTO practice_sessions(account_id,profile_id,scenario_slug,scenario_version,level,mode,prompt_version,state,transcript_revision) VALUES($1,$2,'hotel',1,'A2','NATURAL','tutor-v4','ENDED',1) RETURNING id",[accountId,profile]))[0]!.id;
  const run=(await sql<{id:string}>("INSERT INTO analysis_runs(session_id,account_id,transcript_revision,analyzer_version,status) VALUES($1,$2,1,'analysis-v3','SUCCEEDED') RETURNING id",[sessionId,accountId]))[0]!.id;
  const reportId=(await sql<{id:string}>("INSERT INTO session_reports(analysis_run_id,session_id,account_id,transcript_revision,schema_version,content) VALUES($1,$2,$3,1,'report-v1','{}') RETURNING id",[run,sessionId,accountId]))[0]!.id;
  const identity=vocabularyIdentity(phrase,sense);
  const suggestionId=(await sql<{id:string}>(`INSERT INTO vocabulary_suggestions(account_id,phrase,normalized_phrase,meaning,normalized_sense,source_session_id,source_report_id,source_revision,evidence,origin_version) VALUES($1,$2,$3,$4,$5,$6,$7,1,'{}','vocabulary-suggestion-v1') RETURNING id`,[accountId,phrase,identity.normalizedPhrase,sense,identity.normalizedSense,sessionId,reportId]))[0]!.id;
  return {suggestionId,sessionId,reportId};
}
async function supersede(accountId:string,value:Source){
  const run=(await sql<{id:string}>("INSERT INTO analysis_runs(session_id,account_id,transcript_revision,analyzer_version,status) VALUES($1,$2,2,'analysis-v3','SUCCEEDED') RETURNING id",[value.sessionId,accountId]))[0]!.id;
  await sql('UPDATE practice_sessions SET transcript_revision=2 WHERE id=$1 AND account_id=$2',[value.sessionId,accountId]);
  await sql("UPDATE session_reports SET analysis_run_id=$2,transcript_revision=2,content='{\"replacement\":true}' WHERE id=$1",[value.reportId,run]);
}

describe('M08 vocabulary confirmation and reviews',()=>{
  beforeEach(resetDatabase);

  it('does not offer Spanish instructional report practice as vocabulary',()=>{
    const report={schemaVersion:'report-v1',rubricVersion:'pilot-text-v1',strengths:[],corrections:[{text:'verb tense',explanation:'Usa pasado.',practice:'Repite la idea con una frase completa en inglés.',uncertainty:'low',evidence:[{turnSequence:1,start:0,end:4,quote:'I go'}]}]} satisfies ReportDraft;
    expect(vocabularySuggestionsFromReport(report,{sessionId:'session',revision:1} as AnalysisTranscript)).toEqual([]);
  });

  it('ignores a suggestion without scheduling a card and keeps learner intent distinct',async()=>{
    const a=await account('ignored'),s=await source(a.id);
    await repo.ignore(a.id,s.suggestionId);
    await repo.ignore(a.id,s.suggestionId);
    expect(await repo.listCards(a.id)).toEqual([]);
    expect((await sql<{state:string}>('SELECT state FROM vocabulary_suggestions WHERE id=$1',[s.suggestionId]))[0]!.state).toBe('ignored');
  });

  it('deduplicates duplicate/concurrent confirmation and phrase+sense identity',async()=>{
    const a=await account('confirm'),x=await source(a.id,'Bank!','financial institution'),y=await source(a.id,'bank','financial institution'),z=await source(a.id,'bank','river edge');
    const [one,two]=await Promise.all([repo.confirm(a.id,x.suggestionId),repo.confirm(a.id,x.suggestionId)]);
    expect(one.id).toBe(two.id);
    expect((await repo.confirm(a.id,y.suggestionId)).id).toBe(one.id);
    expect((await repo.confirm(a.id,z.suggestionId)).id).not.toBe(one.id);
    expect(await repo.listCards(a.id)).toHaveLength(2);
  });

  it('uses inclusive due boundaries and excludes future cards',async()=>{
    const a=await account('due'),card=await repo.confirm(a.id,(await source(a.id)).suggestionId);
    await sql('UPDATE vocabulary_cards SET due_at=CURRENT_TIMESTAMP+interval \'1 second\' WHERE id=$1',[card.id]);
    expect(await repo.due(a.id,20)).toEqual([]);
    await sql('UPDATE vocabulary_cards SET due_at=CURRENT_TIMESTAMP WHERE id=$1',[card.id]);
    expect((await repo.due(a.id,20)).map(x=>x.id)).toEqual([card.id]);
    await sql('UPDATE vocabulary_cards SET due_at=CURRENT_TIMESTAMP-interval \'1 millisecond\' WHERE id=$1',[card.id]);
    expect((await repo.due(a.id,20)).map(x=>x.id)).toEqual([card.id]);
  });

  it('makes repeated/concurrent review keys one immutable advancement',async()=>{
    const a=await account('review'),card=await repo.confirm(a.id,(await source(a.id)).suggestionId),key=randomUUID();
    const [one,two]=await Promise.all([
      repo.review(a.id,card.id,{rating:'good',reviewKey:key,expectedVersion:1}),
      repo.review(a.id,card.id,{rating:'good',reviewKey:key,expectedVersion:1}),
    ]);
    expect(one.review.id).toBe(two.review.id);
    expect((await repo.listCards(a.id))[0]!.version).toBe(2);
    expect(await repo.history(a.id,card.id)).toHaveLength(1);
  });

  it('rejects conflicting keys and stale versions while preserving one history event',async()=>{
    const a=await account('conflict'),card=await repo.confirm(a.id,(await source(a.id)).suggestionId),key=randomUUID();
    await repo.review(a.id,card.id,{rating:'good',reviewKey:key,expectedVersion:1});
    await expect(repo.review(a.id,card.id,{rating:'easy',reviewKey:key,expectedVersion:1})).rejects.toThrow('IDEMPOTENCY_CONFLICT');
    await expect(repo.review(a.id,card.id,{rating:'easy',reviewKey:randomUUID(),expectedVersion:1})).rejects.toThrow('STALE_CARD_VERSION');
    const history=await repo.history(a.id,card.id);
    expect(history).toHaveLength(1);
    await expect(sql('UPDATE vocabulary_review_events SET rating=\'easy\' WHERE id=$1',[history[0]!.id])).rejects.toMatchObject({code:'55000'});
  });

  it('isolates suggestions, cards, reviews and history between two accounts',async()=>{
    const owner=await account('owner'),attacker=await account('attacker'),s=await source(owner.id),card=await repo.confirm(owner.id,s.suggestionId);
    expect(await repo.listSuggestions(attacker.id)).toEqual([]);
    await expect(repo.confirm(attacker.id,s.suggestionId)).rejects.toThrow('VOCABULARY_NOT_FOUND');
    await expect(repo.ignore(attacker.id,s.suggestionId)).rejects.toThrow('VOCABULARY_NOT_FOUND');
    await expect(repo.review(attacker.id,card.id,{rating:'again',reviewKey:randomUUID(),expectedVersion:1})).rejects.toThrow('VOCABULARY_NOT_FOUND');
    await expect(repo.history(attacker.id,card.id)).rejects.toThrow('VOCABULARY_NOT_FOUND');
  });

  it('invalidates pending provenance when a report is superseded without recording learner ignore',async()=>{
    const a=await account('pending-supersede'),s=await source(a.id);
    await supersede(a.id,s);
    const row=(await sql<{state:string;source_available:boolean;source_report_id:string|null}>('SELECT state,source_available,source_report_id FROM vocabulary_suggestions WHERE id=$1',[s.suggestionId]))[0]!;
    expect(row).toEqual({state:'invalidated',source_available:false,source_report_id:null});
    await expect(repo.confirm(a.id,s.suggestionId)).rejects.toThrow('VOCABULARY_NOT_FOUND');
    const identity=vocabularyIdentity('Take a seat','Please sit down');
    const replacement=(await sql<{id:string}>(`INSERT INTO vocabulary_suggestions(account_id,phrase,normalized_phrase,meaning,normalized_sense,source_session_id,source_report_id,source_revision,evidence,origin_version) VALUES($1,'Take a seat',$2,'Please sit down',$3,$4,$5,2,'{}','vocabulary-suggestion-v1') RETURNING id`,[a.id,identity.normalizedPhrase,identity.normalizedSense,s.sessionId,s.reportId]))[0]!;
    expect(replacement.id).not.toBe(s.suggestionId);
  });

  it('keeps a confirmed card and history while invalidating superseded provenance',async()=>{
    const a=await account('confirmed-supersede'),s=await source(a.id),card=await repo.confirm(a.id,s.suggestionId);
    await repo.review(a.id,card.id,{rating:'good',reviewKey:randomUUID(),expectedVersion:1});
    await supersede(a.id,s);
    const survivor=(await repo.listCards(a.id))[0]!;
    expect(survivor.id).toBe(card.id);expect(survivor.sourceAvailable).toBe(false);
    expect(survivor.version).toBe(2);expect(await repo.history(a.id,card.id)).toHaveLength(1);
  });

  it('preserves a confirmed card after source deletion and cascades all vocabulary on account deletion',async()=>{
    const a=await account('deletion'),s=await source(a.id),card=await repo.confirm(a.id,s.suggestionId);
    await sql('DELETE FROM practice_sessions WHERE id=$1',[s.sessionId]);
    expect((await repo.listCards(a.id))[0]).toMatchObject({id:card.id,sourceAvailable:false});
    await sql('DELETE FROM accounts WHERE id=$1',[a.id]);
    for(const table of ['vocabulary_suggestions','vocabulary_cards','vocabulary_review_events']) expect((await sql(`SELECT 1 FROM ${table}`))).toEqual([]);
  });
});
