import {expect, it, vi} from 'vitest';
import {AiError} from './ai.js';
import {ConversationService, conversationInitiator, TUTOR_OPENING_KEY, type ConversationProvider} from './conversation.js';
import {FakeConversationProvider, MemorySessionRepository} from '@fluentcoach/testing';

async function fixture(level: 'A1'|'A2'|'B1'|'B2' = 'A2', initiator: 'tutor'|'learner' = 'tutor') {
  const repo = new MemorySessionRepository();
  const s = await repo.create('owner', {scenarioSlug: 'hotel', scenarioVersion: 1, level, mode: 'natural', promptVersion: 'tutor-v4'});
  s.initiator = initiator;
  s.activity = {title: 'Conversación: En un hotel', type: 'conversation'};
  await repo.save(s);
  return {repo, s};
}
it('the persisted UUID gives an even stable split', () => {
  const ids = Array.from({length: 16}, (_, n) => `00000000-0000-4000-8000-00000000000${n.toString(16)}`);
  expect(ids.filter(id => conversationInitiator(id) === 'tutor')).toHaveLength(8);
  expect(ids.map(conversationInitiator)).toEqual(ids.map(conversationInitiator));
});
it('one opening is committed for double requests and reload, with no learner input or practice telemetry', async () => {
  const {repo, s} = await fixture();
  const opening = vi.fn<NonNullable<ConversationProvider['opening']>>().mockResolvedValue({text: 'Hello! Do you have a reservation?'});
  const provider = {opening, stream: vi.fn<ConversationProvider['stream']>()};
  const save = vi.spyOn(repo, 'save');
  const service = new ConversationService(repo, provider);
  const [first, second] = await Promise.all([service.opening('owner', s.id), service.opening('owner', s.id)]);
  expect(first.turns).toEqual(second.turns);
  expect(first.turns).toEqual([{sequence: 1, sourceEventKey: TUTOR_OPENING_KEY, speaker: 'tutor', text: 'Hello! Do you have a reservation?', language: 'en'}]);
  expect((await new ConversationService(repo, provider).opening('owner', s.id)).turns).toEqual(first.turns);
  expect(opening).toHaveBeenCalledOnce();
  expect(opening.mock.calls[0]![0]).toMatchObject({snapshot: {scenarioSlug: 'hotel', level: 'A2'}, activity: s.activity, recentTurns: []});
  expect(provider.stream).not.toHaveBeenCalled();
  expect(save.mock.calls.every(call => call.length <= 2)).toBe(true);
  await expect(service.opening('other', s.id)).rejects.toThrow('SESSION_NOT_FOUND');
});
it('learner-initiated and already started conversations stay untouched', async () => {
  const {repo, s} = await fixture('A1', 'learner');
  const provider = new FakeConversationProvider(), opening = vi.spyOn(provider, 'opening');
  const service = new ConversationService(repo, provider);
  expect((await service.opening('owner', s.id)).turns).toEqual([]);
  expect(opening).not.toHaveBeenCalled();
  s.initiator = 'tutor';
  s.turns.push({sequence: 1, sourceEventKey: 'learner', speaker: 'learner', text: 'Hello', language: 'en'});
  await repo.save(s);
  expect((await service.opening('owner', s.id)).turns).toEqual(s.turns);
  expect(opening).not.toHaveBeenCalled();
});
it.each(['A1','A2','B1','B2'] as const)('bounds %s output and permits a learner start after failure', async level => {
  const {repo, s} = await fixture(level);
  const provider = new FakeConversationProvider();
  const opening = vi.spyOn(provider, 'opening').mockResolvedValue({text: 'word '.repeat(61)});
  const service = new ConversationService(repo, provider);
  const failed = await service.opening('owner', s.id);
  expect(failed).toMatchObject({state: 'created', turns: []});
  expect(failed.events.at(-1)).toMatchObject({kind: 'opening.failed', payload: {code: 'invalid-output'}});
  await service.opening('owner', s.id);
  expect(opening).toHaveBeenCalledOnce();
  expect((await service.turn('owner', s.id, 'real', 'I have a reservation')).turns.map(t => t.speaker)).toEqual(['learner', 'tutor']);
});
it('provider outage and a lost in-flight opening receipt never block the practice or regenerate', async () => {
  const {repo, s} = await fixture();
  const provider = new FakeConversationProvider();
  const opening = vi.spyOn(provider, 'opening').mockRejectedValue(new AiError('unavailable'));
  const service = new ConversationService(repo, provider);
  expect((await service.opening('owner', s.id)).turns).toEqual([]);
  expect((await new ConversationService(repo, provider).opening('owner', s.id)).turns).toEqual([]);
  expect(opening).toHaveBeenCalledOnce();
  s.events = [{sequence: 1, kind: 'opening.requested', payload: {}}];
  await repo.save(s);
  await service.opening('owner', s.id);
  expect(opening).toHaveBeenCalledOnce();
});
