import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  PostgresPlanRepository,
  PostgresIssueRepository,
  PostgresVocabularyRepository,
  sql,
  schemaReady,
} from '@fluentcoach/infrastructure';
import { ConversationService } from '@fluentcoach/application';
import { PostgresSessionRepository } from '@fluentcoach/infrastructure';
import {
  FakeConversationProvider,
  FakePlanGenerator,
} from '@fluentcoach/testing';
import { account, resetDatabase } from '../support/database.js';
import { dueCard, reportPractice } from '../support/m09.js';
const repo = new PostgresPlanRepository(new FakePlanGenerator()),
  generate = (id: string) => repo.generate(id, { requestKey: randomUUID() });
beforeEach(resetDatabase);
describe('M09 plan lifecycle and authoritative evidence', () => {
  it('supports no-history fallback and repeated/concurrent generation', async () => {
    const a = await account('starter');
    const key = randomUUID();
    const plans = await Promise.all([
      repo.generate(a.id, { requestKey: key }),
      repo.generate(a.id, { requestKey: key }),
      generate(a.id),
    ]);
    expect(new Set(plans.map((p) => p.id)).size).toBe(1);
    expect(plans[0]).toMatchObject({
      schemaVersion: 'plan-v1',
      insufficientData: true,
      state: 'proposal',
    });
    expect(plans[0].activities.every((a) => a.type === 'conversation')).toBe(
      true,
    );
  });
  it('accepts idempotently, serializes concurrent acceptance and atomically supersedes', async () => {
    const a = await account('accept'),
      p = await generate(a.id);
    const accepted = await Promise.all([
      repo.accept(a.id, p.id, 1),
      repo.accept(a.id, p.id, 1),
    ]);
    expect(accepted.map((p) => p.state)).toEqual(['active', 'active']);
    const replacement = await repo.generate(a.id, {
      requestKey: randomUUID(),
      planId: p.id,
      expectedVersion: 2,
    });
    expect((await repo.current(a.id)).active?.id).toBe(p.id);
    const results = await Promise.all([
      repo.accept(a.id, replacement.id, 1),
      repo.accept(a.id, replacement.id, 1),
    ]);
    expect(results[0].state).toBe('active');
    expect(
      await sql(
        "SELECT id FROM learning_plans WHERE account_id=$1 AND state='active'",
        [a.id],
      ),
    ).toHaveLength(1);
    expect(
      (
        await sql<{ state: string }>(
          'SELECT state FROM learning_plans WHERE id=$1',
          [p.id],
        )
      )[0]!.state,
    ).toBe('superseded');
    await expect(repo.accept(a.id, p.id, 1)).rejects.toThrow(
      'STALE_PLAN_VERSION',
    );
  });
  it('concurrent active refresh creates one proposal; proposal refresh replaces and rejects stale versions', async () => {
    const a = await account('refresh'),
      p = await generate(a.id);
    await repo.accept(a.id, p.id, 1);
    const proposals = await Promise.all([
      repo.generate(a.id, {
        requestKey: randomUUID(),
        planId: p.id,
        expectedVersion: 2,
      }),
      repo.generate(a.id, {
        requestKey: randomUUID(),
        planId: p.id,
        expectedVersion: 2,
      }),
    ]);
    expect(proposals[0].id).toBe(proposals[1].id);
    const old = proposals[0],
      next = await repo.generate(a.id, {
        requestKey: randomUUID(),
        planId: old.id,
        expectedVersion: 1,
      });
    expect(next.id).not.toBe(old.id);
    await expect(
      repo.generate(a.id, {
        requestKey: randomUUID(),
        planId: old.id,
        expectedVersion: 1,
      }),
    ).rejects.toThrow('STALE_PLAN_VERSION');
    expect((await repo.current(a.id)).active?.id).toBe(p.id);
  });
  it('skip is idempotent and rejects stale mutations on another activity', async () => {
    const a = await account('skip'),
      p = await generate(a.id),
      act = p.activities[0]!;
    const results = await Promise.all([
      repo.skip(a.id, p.id, act.id, 1),
      repo.skip(a.id, p.id, act.id, 1),
    ]);
    expect(results[0].version).toBe(2);
    await expect(repo.skip(a.id, p.id, p.activities[1]!.id, 1)).rejects.toThrow(
      'STALE_PLAN_VERSION',
    );
  });
  it('uses current active issues, due owned cards and excludes dismissed/non-due/ignored', async () => {
    const a = await account('evidence');
    await reportPractice(a.id, 2);
    await reportPractice(a.id, 1);
    const card = await dueCard(a.id),
      p = await generate(a.id);
    expect(
      p.activities.find((a) => a.type === 'recurring-issue-practice')?.evidence
        ?.length,
    ).toBeGreaterThanOrEqual(3);
    expect(
      p.activities.find((a) => a.type === 'vocabulary-review')?.cardIds,
    ).toContain(card.id);
    await new PostgresIssueRepository().setDismissed(a.id, 'verb-tense', true);
    await sql(
      "UPDATE vocabulary_cards SET due_at=now()+interval '1 day' WHERE id=$1",
      [card.id],
    );
    const next = await repo.generate(a.id, {
      requestKey: randomUUID(),
      planId: p.id,
      expectedVersion: 1,
    });
    expect(next.activities.every((a) => a.type === 'conversation')).toBe(true);
  });
  it.each([
    'report',
    'invalid-report',
    'session',
    'dismissal',
    'future-card',
  ] as const)(
    'revalidates %s changes after generation, redacts unavailable sources and rejects acceptance',
    async (change) => {
      const a = await account('changed');
      await reportPractice(a.id, 2);
      await reportPractice(a.id, 1);
      const card = await dueCard(a.id),
        p = await generate(a.id);
      if (change === 'dismissal')
        await new PostgresIssueRepository().setDismissed(
          a.id,
          'verb-tense',
          true,
        );
      else if (change === 'future-card')
        await sql(
          "UPDATE vocabulary_cards SET due_at=now()+interval '1 day' WHERE id=$1",
          [card.id],
        );
      else if (change === 'invalid-report')
        await sql(
          "UPDATE session_reports SET content='{}' WHERE account_id=$1",
          [a.id],
        );
      else
        await sql(
          `DELETE FROM ${change === 'session' ? 'practice_sessions' : 'session_reports'} WHERE account_id=$1`,
          [a.id],
        );
      await expect(repo.accept(a.id, p.id, 1)).rejects.toThrow(
        'PLAN_SOURCES_CHANGED',
      );
      const current = (await repo.current(a.id)).proposal!;
      expect(current.activities.some((a) => a.state === 'unavailable')).toBe(
        true,
      );
      expect(
        current.activities
          .filter((a) => a.state === 'unavailable')
          .every((a) => !a.evidence?.length && !a.cardIds?.length),
      ).toBe(true);
    },
  );
  it('rejects injected generator foreign/nonexistent IDs and unsupported types with retryable failure', async () => {
    const a = await account('bad-generator');
    await dueCard(a.id);
    const b = await account('foreign');
    const foreign = await dueCard(b.id);
    for (const raw of [
      { candidateIds: [foreign.id, 'conversation:hotel'] },
      { candidateIds: ['evidence:missing', 'conversation:hotel'] },
      { candidateIds: ['exam', 'due-vocabulary'] },
      { candidateIds: ['due-vocabulary', 'due-vocabulary'] },
      {
        candidateIds: ['conversation:hotel', 'conversation:travel'],
        activityType: 'evil',
      },
    ]) {
      await expect(
        new PostgresPlanRepository({
          select: () => Promise.resolve(raw),
        }).generate(a.id, { requestKey: randomUUID() }),
      ).rejects.toThrow('PLAN_GENERATION_RETRYABLE');
    }
    expect((await repo.current(a.id)).proposal).toBeNull();
  });
  it('isolates every plan/action/evidence and deletes all M09 account state', async () => {
    const a = await account('owner'),
      b = await account('attacker');
    await dueCard(a.id);
    const p = await generate(a.id);
    expect(await repo.current(b.id)).toEqual({ active: null, proposal: null });
    for (const action of [
      () => repo.accept(b.id, p.id, 1),
      () =>
        repo.generate(b.id, {
          requestKey: randomUUID(),
          planId: p.id,
          expectedVersion: 1,
        }),
      () => repo.skip(b.id, p.id, p.activities[0]!.id, 1),
      () => repo.start(b.id, p.id, p.activities[0]!.id, 1),
    ])
      await expect(action()).rejects.toThrow('PLAN_NOT_FOUND');
    const bp = await generate(b.id);
    expect(bp.activities.every((a) => a.type === 'conversation')).toBe(true);
    await sql('DELETE FROM accounts WHERE id=$1', [a.id]);
    for (const table of [
      'learning_plans',
      'learning_plan_activities',
      'learning_plan_requests',
      'practice_events',
    ])
      expect(
        await sql(`SELECT 1 FROM ${table} WHERE account_id=$1`, [a.id]),
      ).toEqual([]);
  });
  it('opening an activity does not complete it; only an accepted completed linked session does', async () => {
    const a = await account('completion'),
      p = await generate(a.id),
      active = await repo.accept(a.id, p.id, 1);
    const result = await repo.start(
      a.id,
      p.id,
      active.activities[0]!.id,
      active.version,
    );
    expect(result.plan.activities[0]!.state).toBe('started');
    const service = new ConversationService(
      new PostgresSessionRepository(),
      new FakeConversationProvider(),
    );
    await service.turn(a.id, result.sessionId!, 'accepted', 'I want a room');
    await service.end(a.id, result.sessionId!);
    expect((await repo.current(a.id)).active!.activities[0]!.state).toBe(
      'completed',
    );
    await sql('DELETE FROM practice_sessions WHERE id=$1', [result.sessionId]);
    expect((await repo.current(a.id)).active!.activities[0]!.state).not.toBe(
      'completed',
    );
  });
  it('review completion uses distinct canonical target cards after start and duplicate delivery cannot inflate it', async () => {
    const a = await account('review-completion'),
      card = await dueCard(a.id),
      p = await generate(a.id),
      active = await repo.accept(a.id, p.id, 1),
      act = active.activities.find((a) => a.type === 'vocabulary-review')!;
    await repo.start(a.id, p.id, act.id, active.version);
    const reviews = new PostgresVocabularyRepository(),
      input = {
        reviewKey: randomUUID(),
        expectedVersion: 1,
        rating: 'good' as const,
      };
    await Promise.all([
      reviews.review(a.id, card.id, input),
      reviews.review(a.id, card.id, input),
    ]);
    expect(
      (await repo.current(a.id)).active!.activities.find(
        (a) => a.id === act.id,
      )!.state,
    ).toBe('completed');
    await sql('DELETE FROM vocabulary_suggestions WHERE card_id=$1', [card.id]);
    await sql('DELETE FROM vocabulary_cards WHERE id=$1', [card.id]);
    expect(
      (await repo.current(a.id)).active!.activities.find(
        (a) => a.id === act.id,
      )!.state,
    ).not.toBe('completed');
  });
  it('requires M09 migration and required columns for readiness', async () => {
    expect(await schemaReady()).toBe(true);
    await sql(
      "UPDATE _prisma_migrations SET rolled_back_at=now() WHERE migration_name='202610050003_m09_plans_progress'",
    );
    expect(await schemaReady()).toBe(false);
    await sql(
      "UPDATE _prisma_migrations SET rolled_back_at=NULL WHERE migration_name='202610050003_m09_plans_progress'",
    );
    await sql(
      'ALTER TABLE practice_events RENAME COLUMN duration_ms TO missing_duration',
    );
    try {
      expect(await schemaReady()).toBe(false);
    } finally {
      await sql(
        'ALTER TABLE practice_events RENAME COLUMN missing_duration TO duration_ms',
      );
    }
    expect(await schemaReady()).toBe(true);
  });
  it('database partial indexes independently protect current plan uniqueness', async () => {
    const a = await account('constraints');
    await generate(a.id);
    await expect(
      sql(
        "INSERT INTO learning_plans(account_id,schema_version,generator_version,catalog_version,source_snapshot,rationale,insufficient_data) VALUES($1,'plan-v1','plan-generator-v1','plan-catalog-v1','{}','test',true)",
        [a.id],
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });
});
