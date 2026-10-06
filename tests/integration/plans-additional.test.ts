import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it } from 'vitest';
import {
  PostgresPlanRepository,
  PostgresVocabularyRepository,
  sql,
} from '@fluentcoach/infrastructure';
import { FakePlanGenerator } from '@fluentcoach/testing';
import { DeterministicPlanGenerator } from '@fluentcoach/application';
import { account, resetDatabase } from '../support/database.js';
import { dueCard, reportPractice } from '../support/m09.js';
const repo = new PostgresPlanRepository(new FakePlanGenerator());
beforeEach(resetDatabase);
it('concurrent proposal refresh allows one replacement and conflicts stale work', async () => {
  const a = await account('proposal-race'),
    p = await repo.generate(a.id, { requestKey: randomUUID() });
  const results = await Promise.allSettled([
    repo.generate(a.id, {
      requestKey: randomUUID(),
      planId: p.id,
      expectedVersion: 1,
    }),
    repo.generate(a.id, {
      requestKey: randomUUID(),
      planId: p.id,
      expectedVersion: 1,
    }),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  expect(
    await sql(
      "SELECT 1 FROM learning_plans WHERE account_id=$1 AND state='proposal'",
      [a.id],
    ),
  ).toHaveLength(1);
});
it('invalid generation refresh rolls back replacement and preserves current active and proposal', async () => {
  const a = await account('retry');
  const p = await repo.generate(a.id, { requestKey: randomUUID() });
  await repo.accept(a.id, p.id, 1);
  const proposal = await repo.generate(a.id, {
    requestKey: randomUUID(),
    planId: p.id,
    expectedVersion: 2,
  });
  const bad = new PostgresPlanRepository({
    select: () => Promise.reject(Error('unavailable')),
  });
  await expect(
    bad.generate(a.id, {
      requestKey: randomUUID(),
      planId: proposal.id,
      expectedVersion: 1,
    }),
  ).rejects.toThrow('PLAN_GENERATION_RETRYABLE');
  const current = await repo.current(a.id);
  expect(current.active!.id).toBe(p.id);
  expect(current.proposal!.id).toBe(proposal.id);
});
it('profile/goal changes conflict acceptance and in-flight selection revalidates its snapshot', async () => {
  const a = await account('goal-change'),
    p = await repo.generate(a.id, { requestKey: randomUUID() });
  await sql(
    'INSERT INTO practice_goals(account_id,minutes_per_day,days_per_week) VALUES($1,15,4)',
    [a.id],
  );
  await expect(repo.accept(a.id, p.id, 1)).rejects.toThrow(
    'PLAN_SOURCES_CHANGED',
  );
  let release!: () => void, started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const generator = {
    async select(
      candidates: Parameters<DeterministicPlanGenerator['select']>[0],
    ) {
      started();
      await gate;
      return new DeterministicPlanGenerator().select(candidates);
    },
  };
  const generated = new PostgresPlanRepository(generator).generate(a.id, {
    requestKey: randomUUID(),
    planId: p.id,
    expectedVersion: 1,
  });
  await ready;
  const changed = sql(
    "/* m09_snapshot_race */ UPDATE learner_profiles SET cefr_level='B2',version=version+1 WHERE account_id=$1",
    [a.id],
  );
  // M10 releases the account mutex during provider selection so deletion can revoke.
  try { await changed; } finally { release(); }
  await expect(generated).rejects.toThrow('PLAN_GENERATION_RETRYABLE');
  expect((await repo.current(a.id)).proposal!.id).toBe(p.id);
  const replacement=await repo.generate(a.id,{requestKey:randomUUID(),planId:p.id,expectedVersion:1});
  expect(replacement.activities.every(activity=>activity.level==='B2')).toBe(true);
  await expect(repo.accept(a.id,p.id,1)).rejects.toThrow('STALE_PLAN_VERSION');
});

it('ignored vocabulary never becomes a plan review activity', async () => {
  const a = await account('ignored-plan');
  await reportPractice(a.id, 1);
  const vocabulary = new PostgresVocabularyRepository(),
    suggestions = await vocabulary.listSuggestions(a.id);
  await vocabulary.ignore(a.id, suggestions[0]!.id);
  const p = await repo.generate(a.id, { requestKey: randomUUID() });
  expect(p.activities.every((a) => a.type === 'conversation')).toBe(true);
  expect(await vocabulary.listCards(a.id)).toEqual([]);
});
it('foreign recurring issue candidate and report IDs never become recommendations', async () => {
  const a = await account('issue-owner'),
    b = await account('issue-attacker');
  await reportPractice(a.id, 2);
  await reportPractice(a.id, 1);
  const owned = await repo.generate(a.id, { requestKey: randomUUID() });
  expect(
    owned.activities.some((a) => a.type === 'recurring-issue-practice'),
  ).toBe(true);
  for (const id of [
    'issue:verb-tense',
    owned.activities.find((a) => a.type === 'recurring-issue-practice')!
      .evidence![0]!.reportId,
  ])
    await expect(
      new PostgresPlanRepository({
        select: () =>
          Promise.resolve({ candidateIds: [id, 'conversation:hotel'] }),
      }).generate(b.id, { requestKey: randomUUID() }),
    ).rejects.toThrow('PLAN_GENERATION_RETRYABLE');
});
it('partial multi-card review progress survives no-longer-due sources and completion rebuild', async () => {
  const a = await account('multi-card'),
    first = await dueCard(a.id);
  const reportSession = await reportPractice(a.id, 1);
  await sql(
    `UPDATE session_reports SET content=jsonb_set(content,'{corrections,0,practice}','"Can I check in?"') WHERE session_id=$1`,
    [reportSession.id],
  );
  const vocabulary = new PostgresVocabularyRepository();
  const suggestion = (await vocabulary.listSuggestions(a.id)).find(
    (s) => s.phrase === 'Can I check in?',
  )!;
  const second = await vocabulary.confirm(a.id, suggestion.id);
  const p = await repo.generate(a.id, { requestKey: randomUUID() }),
    active = await repo.accept(a.id, p.id, 1),
    activity = active.activities.find((a) => a.type === 'vocabulary-review')!;
  expect(activity.targetCount).toBe(2);
  await repo.start(a.id, p.id, activity.id, active.version);
  const input = {
    rating: 'good' as const,
    reviewKey: randomUUID(),
    expectedVersion: 1,
  };
  await vocabulary.review(a.id, first.id, input);
  await vocabulary.review(a.id, first.id, input);
  expect(
    (await repo.current(a.id)).active!.activities.find(
      (a) => a.id === activity.id,
    )!.state,
  ).not.toBe('completed');
  await vocabulary.review(a.id, second.id, {
    ...input,
    reviewKey: randomUUID(),
  });
  expect(
    (await repo.current(a.id)).active!.activities.find(
      (a) => a.id === activity.id,
    )!.state,
  ).toBe('completed');
});

it('replays concurrent and lost-acknowledgement starts with the original version into exactly one session', async () => {
  const a = await account('start-retry');
  const proposal = await repo.generate(a.id, {requestKey: randomUUID()});
  const active = await repo.accept(a.id, proposal.id, proposal.version);
  const activity = active.activities.find(a => a.type === 'conversation')!;
  const results = await Promise.all([
    repo.start(a.id, active.id, activity.id, active.version),
    repo.start(a.id, active.id, activity.id, active.version),
  ]);
  const replay = await repo.start(a.id, active.id, activity.id, active.version);
  expect(new Set([...results, replay].map(r => r.sessionId)).size).toBe(1);
  expect(await sql('SELECT id FROM practice_sessions WHERE account_id=$1', [a.id])).toHaveLength(1);
  expect(replay.plan.version).toBe(active.version + 1);
  const next = active.activities.find(a => a.id !== activity.id)!;
  await expect(repo.start(a.id, active.id, next.id, active.version)).rejects.toThrow('STALE_PLAN_VERSION');
});
