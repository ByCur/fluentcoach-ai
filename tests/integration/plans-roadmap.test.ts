import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it } from 'vitest';
import { PostgresPlanRepository, PostgresSessionRepository, PostgresVocabularyRepository, PostgresPrivacyRepository, sql, schemaReady } from '@fluentcoach/infrastructure';
import { ConversationService, DeterministicPlanGenerator } from '@fluentcoach/application';
import { FakeConversationProvider } from '@fluentcoach/testing';
import { account, resetDatabase } from '../support/database.js';
import { dueCard, reportPractice } from '../support/m09.js';
const repo = new PostgresPlanRepository();
beforeEach(resetDatabase);

it('concurrent creation and reload make one active roadmap, no proposal or duplicated activities', async () => {
  const a = await account('roadmap-create');
  await sql("UPDATE learner_profiles SET cefr_level='B1', interests=ARRAY['viajes'] WHERE account_id=$1", [a.id]);
  const results = await Promise.all([repo.roadmap(a.id), repo.roadmap(a.id), repo.roadmap(a.id)]);
  expect(new Set(results.map(p => p.id)).size).toBe(1);
  expect(results[0].activities).toHaveLength(14);
  expect(results[0].activities[0]?.scenarioSlug).toBe('travel');
  const reloaded = await repo.roadmap(a.id);
  expect(reloaded.activities.map(a => a.id)).toEqual(results[0].activities.map(a => a.id));
  expect(await sql("SELECT id FROM learning_plans WHERE account_id=$1 AND state='active'", [a.id])).toHaveLength(1);
  expect((await repo.current(a.id)).proposal).toBeNull();
});

it.each(['outage', 'foreign-id', 'duplicate', 'scores', 'invented-type'])(
  'roadmap safely uses deterministic fallback for provider %s', async failure => {
    const a = await account(failure);
    const generator = { select: () => failure === 'outage' ? Promise.reject(Error('provider down')) : Promise.resolve(
      failure === 'foreign-id' ? {candidateIds: [randomUUID(), 'conversation:hotel']} :
      failure === 'duplicate' ? {candidateIds: ['conversation:hotel','conversation:hotel']} :
      failure === 'scores' ? {candidateIds: ['conversation:hotel','conversation:travel'], score: 90} :
      {candidateIds: ['exam','conversation:hotel']},
    ) };
    const route = await new PostgresPlanRepository(generator).roadmap(a.id);
    expect(route.activities[0]?.scenarioSlug).toBe('introductions');
    expect(route.activities).toHaveLength(14);
    expect(route.activities.every(a => a.type === 'conversation')).toBe(true);
  },
);

it('accepted provider ordering uses only server definitions and moves recent topics behind new topics', async () => {
  const a = await account('provider-order');
  await reportPractice(a.id, 1);
  const route = await new PostgresPlanRepository({select: () => Promise.resolve({candidateIds: ['conversation:hotel','conversation:opinions']})}).roadmap(a.id);
  expect(route.activities[0]?.scenarioSlug).toBe('opinions');
  expect(route.activities.at(-1)?.scenarioSlug).toBe('hotel');
  expect(route.activities[0]?.level).toBe('A2');
});

it('adaptation keeps completed and in-flight identities, then prioritizes recurring issues and due vocabulary', async () => {
  const a = await account('adaptation');
  const initial = await repo.roadmap(a.id), first = initial.activities[0]!;
  const started = await repo.start(a.id, initial.id, first.id, initial.version);
  const conversation = new ConversationService(new PostgresSessionRepository(), new FakeConversationProvider());
  await conversation.turn(a.id, started.sessionId!, 'first', 'I work in a shop');
  await conversation.end(a.id, started.sessionId!);
  const advanced = await repo.roadmap(a.id);
  expect(advanced.activities[0]).toMatchObject({id: first.id, state: 'completed'});
  const second = advanced.activities.find(a => a.state === 'pending')!;
  const continuing = await repo.start(a.id, advanced.id, second.id, advanced.version);
  await reportPractice(a.id, 2);
  await reportPractice(a.id, 1);
  const card = await dueCard(a.id);
  const adapted = await repo.roadmap(a.id);
  expect(adapted.activities.slice(0,2).map(a => a.id)).toEqual([first.id, second.id]);
  expect(adapted.activities[1]?.sessionId).toBe(continuing.sessionId);
  expect(adapted.activities[2]?.type).toBe('recurring-issue-practice');
  expect(adapted.activities.find(a => a.type === 'vocabulary-review')?.cardIds).toContain(card.id);
  expect(adapted.adaptedAt).toBeTruthy();
  // Starting an upcoming step is rejected; the current conversation remains authoritative.
  await expect(repo.start(a.id, adapted.id, adapted.activities[2]!.id, adapted.version)).rejects.toThrow('ACTIVITY_STATE_CONFLICT');
});

it('short reviews advance and new due vocabulary can create another review without rewriting history', async () => {
  const a = await account('review-route'), card = await dueCard(a.id);
  const initial = await repo.roadmap(a.id), review = initial.activities[0]!;
  expect(review.type).toBe('vocabulary-review');
  await repo.start(a.id, initial.id, review.id, initial.version);
  await new PostgresVocabularyRepository().review(a.id, card.id, {reviewKey: randomUUID(), expectedVersion: card.version, rating: 'good'});
  const completed = await repo.roadmap(a.id);
  expect(completed.activities[0]).toMatchObject({id: review.id, state: 'completed'});
  await sql('UPDATE vocabulary_cards SET due_at=now() WHERE id=$1', [card.id]);
  const next = await repo.roadmap(a.id);
  expect(next.activities[0]).toMatchObject({id: review.id, state: 'completed'});
  expect(next.activities[1]?.type).toBe('vocabulary-review');
  expect(next.activities[1]?.id).not.toBe(review.id);
});

it('deletion during inference revokes the route without waiting or recreating account state', async () => {
  const a = await account('delete-route');
  let entered!: () => void, release!: () => void;
  const ready = new Promise<void>(r => {entered = r;});
  const gate = new Promise<void>(r => {release = r;});
  const deferred = new PostgresPlanRepository({select: async candidates => {entered(); await gate; return new DeterministicPlanGenerator().select(candidates);}});
  const work = deferred.roadmap(a.id);
  const outcome = work.catch((e: unknown) => e);
  await ready;
  await new PostgresPrivacyRepository().requestDeletion(a.id, randomUUID());
  release();
  expect(await outcome).toBeInstanceOf(Error);
  expect(await sql('SELECT id FROM learning_plans WHERE account_id=$1', [a.id])).toEqual([]);
});

it('requires the additive roadmap migration and start receipts for readiness', async () => {
  expect(await schemaReady()).toBe(true);
  await sql("UPDATE _prisma_migrations SET rolled_back_at=now() WHERE migration_name='202610060003_roadmap'");
  try {expect(await schemaReady()).toBe(false);} finally {await sql("UPDATE _prisma_migrations SET rolled_back_at=NULL WHERE migration_name='202610060003_roadmap'");}
});

it('a terminated empty practice can never leave the route stuck on a terminal session', async () => {
  const a = await account('empty-ended');
  const route = await repo.roadmap(a.id), activity = route.activities[0]!;
  const started = await repo.start(a.id, route.id, activity.id, route.version);
  await new ConversationService(new PostgresSessionRepository(), new FakeConversationProvider()).end(a.id, started.sessionId!);
  const next = await repo.roadmap(a.id);
  expect(next.activities.some(a => a.state === 'started')).toBe(false);
  expect(next.activities.find(a => a.state === 'pending')).toBeTruthy();
  expect(next.activities.filter(a => a.state === 'completed')).toHaveLength(0);
});

it('dismissing an issue during its practice redacts evidence and adapts upcoming steps while preserving the owned session', async () => {
  const { PostgresIssueRepository } = await import('@fluentcoach/infrastructure');
  const a = await account('dismiss-in-flight');
  await reportPractice(a.id, 2); await reportPractice(a.id, 1);
  const route = await repo.roadmap(a.id), issue = route.activities[0]!;
  expect(issue.type).toBe('recurring-issue-practice');
  const started = await repo.start(a.id, route.id, issue.id, route.version);
  await new PostgresIssueRepository().setDismissed(a.id, issue.issueKey!, true);
  const adapted = await repo.roadmap(a.id);
  expect(adapted.activities[0]).toMatchObject({id: issue.id, sessionId: started.sessionId, state: 'started', evidence: []});
  expect(adapted.activities.filter(a => a.state === 'pending').every(a => a.type === 'conversation')).toBe(true);
});
