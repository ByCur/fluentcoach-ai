import {randomUUID} from 'node:crypto';
import {beforeEach, expect, it, vi} from 'vitest';
import {ConversationService, AiError} from '@fluentcoach/application';
import {OllamaTextAdapter, PostgresSessionRepository, PostgresPlanRepository, PostgresProgressRepository, PostgresJobStore, sql} from '@fluentcoach/infrastructure';
import {FakeConversationProvider} from '@fluentcoach/testing';
import {account, resetDatabase} from '../support/database.js';
import {setSessionInitiator} from '../support/session-initiator.js';
beforeEach(resetDatabase);
async function practice(initiator: 'tutor'|'learner') {
  const owner = await account(`opener-${randomUUID()}`), repo = new PostgresSessionRepository();
  const route = await new PostgresPlanRepository().roadmap(owner.id);
  const started = await new PostgresPlanRepository().start(owner.id, route.id, route.activities[0]!.id, route.version);
  started.sessionId = await setSessionInitiator(started.sessionId!, initiator);
  return {owner, repo, id: started.sessionId, route};
}
it('persists exactly one Ollama tutor opener across concurrent services, reload and lost acknowledgement without learner evidence', async () => {
  const {owner, repo, id, route} = await practice('tutor');
  let entered!: () => void, release!: () => void;
  const ready = new Promise<void>(resolve => {entered = resolve;}), gate = new Promise<void>(resolve => {release = resolve;});
  const request = vi.fn<typeof fetch>(async () => {entered(); await gate; return new Response(JSON.stringify({model: 'llama3.2:3b', message: {role: 'assistant', content: 'Hello! What is your name?'}, done: true}));});
  const provider = new OllamaTextAdapter({}, request), service = new ConversationService(repo, provider, new PostgresJobStore());
  const first = service.opening(owner.id, id), double = service.opening(owner.id, id);
  await ready;
  const secondProcess = await new ConversationService(new PostgresSessionRepository(), provider).opening(owner.id, id);
  expect(secondProcess.events.some(e => e.kind === 'opening.requested')).toBe(true);
  release();
  const opened = await first;
  expect((await double).turns).toEqual(opened.turns);
  expect(opened.turns.map(t => t.speaker)).toEqual(['tutor']);
  expect((await new ConversationService(repo, provider).opening(owner.id, id)).turns).toEqual(opened.turns);
  expect(request).toHaveBeenCalledOnce();
  expect((await repo.get(owner.id, id))!.turns).toEqual(opened.turns);
  for (const table of ['practice_events','issue_observations','vocabulary_suggestions','vocabulary_cards','analysis_runs','transcript_revisions','outbox_events']) {
    expect(await sql(`SELECT * FROM ${table} WHERE account_id=$1`, [owner.id])).toEqual([]);
  }
  expect(await new PostgresProgressRepository().get(owner.id)).toMatchObject({activeMinutes: 0});
  await service.end(owner.id, id);
  expect(await sql('SELECT * FROM practice_events WHERE account_id=$1', [owner.id])).toEqual([]);
  expect(await sql('SELECT status FROM analysis_runs WHERE account_id=$1', [owner.id])).toEqual([{status: 'SKIPPED'}]);
  expect((await new PostgresPlanRepository().roadmap(owner.id)).activities.filter(a => a.state === 'completed')).toHaveLength(0);
  expect(route.activities[0]!.state).toBe('pending');
});
it('learner sessions start empty and Ollama failure preserves a usable learner start without retries', async () => {
  const {owner, repo, id} = await practice('learner');
  const provider = new FakeConversationProvider(), opening = vi.spyOn(provider, 'opening');
  expect((await new ConversationService(repo, provider).opening(owner.id, id)).turns).toEqual([]);
  expect(opening).not.toHaveBeenCalled();
  await resetDatabase();
  const tutor = await practice('tutor');
  const request = vi.fn<typeof fetch>().mockRejectedValue(new AiError('unavailable'));
  const ollama = new OllamaTextAdapter({}, request);
  const service = new ConversationService(tutor.repo, ollama);
  const failed = await service.opening(tutor.owner.id, tutor.id);
  expect(failed).toMatchObject({state: 'created', turns: []});
  expect(failed.events.at(-1)!.kind).toBe('opening.failed');
  await new ConversationService(tutor.repo, ollama).opening(tutor.owner.id, tutor.id);
  expect(request).toHaveBeenCalledOnce();
  expect((await new ConversationService(tutor.repo, provider).turn(tutor.owner.id, tutor.id, 'real-learner', 'Hello')).turns.map(t => t.speaker)).toEqual(['learner','tutor']);
});

it('a successful real learner turn after the opener produces normal progress and roadmap completion', async () => {
  const {owner, repo, id} = await practice('tutor');
  const service = new ConversationService(repo, new FakeConversationProvider(), new PostgresJobStore());
  await service.opening(owner.id, id);
  await service.turn(owner.id, id, 'real', 'My name is Ana', {kind: 'text', durationMs: 60000});
  await service.end(owner.id, id);
  expect((await sql<{kind: string}>('SELECT kind FROM practice_events WHERE account_id=$1 ORDER BY kind', [owner.id])).map(r => r.kind)).toEqual(['session-completed', 'text']);
  expect(await new PostgresProgressRepository().get(owner.id)).toMatchObject({activeMinutes: 1, completedSessions: 1});
  expect((await new PostgresPlanRepository().roadmap(owner.id)).activities.filter(a => a.state === 'completed')).toHaveLength(1);
});
