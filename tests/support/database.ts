import { sql, PostgresSessionRepository } from '@fluentcoach/infrastructure';
import type { AnalysisJob, AnalysisRun } from '@fluentcoach/application';
export async function resetDatabase() {
  if (!process.env['DATABASE_URL']) throw new Error('DATABASE_URL is required: database gates must not be skipped');
  await sql('TRUNCATE accounts CASCADE');
}
export async function account(subject: string) {
  const id = (await sql<{id: string}>("INSERT INTO accounts(oidc_issuer,oidc_subject) VALUES('synthetic-tests',$1) RETURNING id", [subject]))[0]!.id;
  const profile = (await sql<{id: string}>("INSERT INTO learner_profiles(account_id,interface_language,native_language,timezone,cefr_level,interests) VALUES($1,'es','es','UTC','A2','{}') RETURNING id", [id]))[0]!.id;
  return {id, profile};
}
export async function session(accountId: string, withTurn = true) {
  const repo = new PostgresSessionRepository();
  const record = await repo.create(accountId, {scenarioSlug: 'hotel', scenarioVersion: 1, level: 'A2', mode: 'natural', promptVersion: 'tutor-v1'});
  if (withTurn) {
    record.state = 'active';
    record.turns.push({sequence: 1, sourceEventKey: 'learner-1', speaker: 'learner', text: 'A synthetic room request', language: 'en'});
    await repo.save(record);
  }
  return record;
}
export const envelope = (run: AnalysisRun): AnalysisJob => ({version: 1, analysisRunId: run.id, accountId: run.accountId, sessionId: run.sessionId, transcriptRevision: run.revision, ...(run.deletionEpoch===undefined?{}:{deletionEpoch:run.deletionEpoch})});
