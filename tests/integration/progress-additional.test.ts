import { beforeEach, expect, it } from 'vitest';
import { ConversationService } from '@fluentcoach/application';
import {
  PostgresLearnerRepository,
  PostgresSessionRepository,
  PostgresProgressRepository,
  sql,
} from '@fluentcoach/infrastructure';
import { FakeConversationProvider } from '@fluentcoach/testing';
import { account, resetDatabase } from '../support/database.js';
import { reportPractice } from '../support/m09.js';
const repo = new PostgresSessionRepository();
beforeEach(resetDatabase);
it('concurrent duplicate database practice commits count once independently of process deduplication', async () => {
  const a = await account('database-race'),
    s = await repo.create(a.id, {
      scenarioSlug: 'hotel',
      scenarioVersion: 1,
      level: 'A1',
      mode: 'natural',
      promptVersion: 'tutor-v4',
    });
  s.state = 'active';
  s.turns = [
    {
      sequence: 1,
      sourceEventKey: 'source',
      speaker: 'learner',
      language: 'en',
      text: 'synthetic learner',
    },
    {
      sequence: 2,
      sourceEventKey: 'source:reply',
      speaker: 'tutor',
      language: 'en',
      text: 'synthetic tutor',
    },
  ];
  await Promise.all([
    repo.save(s, undefined, {
      kind: 'voice',
      durationMs: 30000,
      sourceEventKey: 'source',
    }),
    repo.save(s, undefined, {
      kind: 'voice',
      durationMs: 30000,
      sourceEventKey: 'source',
    }),
  ]);
  expect(
    await sql('SELECT 1 FROM practice_events WHERE account_id=$1', [a.id]),
  ).toHaveLength(1);
  expect(
    (await new PostgresProgressRepository().get(a.id)).speakingMinutes,
  ).toBe(0.5);
});
it('turn keys cannot collide with session completion and cross-channel duplicate cannot inflate time', async () => {
  const a = await account('namespaces'),
    c = new ConversationService(repo, new FakeConversationProvider()),
    s = await c.start(a.id, {
      scenarioSlug: 'hotel',
      level: 'A1',
      mode: 'natural',
    });
  await c.turn(a.id, s.id, 'session-completed', 'synthetic', {
    kind: 'voice',
    durationMs: 30000,
  });
  await c.turn(a.id, s.id, 'session-completed', 'synthetic', {
    kind: 'text',
    durationMs: 300000,
  });
  await c.end(a.id, s.id);
  const metrics = await new PostgresProgressRepository().get(a.id);
  expect(metrics).toMatchObject({
    completedSessions: 1,
    speakingMinutes: 0.5,
    textMinutes: 0,
  });
});
it('issue buckets expose validated examples/session counts, redismissal and report deletion rebuild', async () => {
  const a = await account('transparent-trend'),
    p = await reportPractice(a.id, 2);
  await reportPractice(a.id, 1);
  const repository = new PostgresProgressRepository(),
    trends = await repository.issues(a.id);
  expect(trends[0]).toMatchObject({ observationCount: 3, sessionCount: 2 });
  expect(trends[0]!.buckets.reduce((n, b) => n + b.observations, 0)).toBe(3);
  expect(trends[0]!.message).toContain('Datos insuficientes');
  expect(trends[0]!.evidence).toHaveLength(3);
  await sql('DELETE FROM session_reports WHERE session_id=$1', [p.id]);
  expect(await repository.issues(a.id)).toEqual([]);
  expect(await repository.issues(a.id)).toEqual([]);
});
it('practice event updates are forbidden and deleting a learner source turn rebuilds active time', async () => {
  const a = await account('immutable'),
    c = new ConversationService(repo, new FakeConversationProvider()),
    s = await c.start(a.id, {
      scenarioSlug: 'hotel',
      level: 'A1',
      mode: 'natural',
    });
  await c.turn(a.id, s.id, 'source', 'synthetic', {
    kind: 'text',
    durationMs: 60000,
  });
  await expect(
    sql('UPDATE practice_events SET duration_ms=300000 WHERE account_id=$1', [
      a.id,
    ]),
  ).rejects.toMatchObject({ code: '55000' });
  await sql(
    "DELETE FROM conversation_turns WHERE session_id=$1 AND speaker='learner'",
    [s.id],
  );
  expect((await new PostgresProgressRepository().get(a.id)).activeMinutes).toBe(
    0,
  );
});

it('profile/onboarding updates and session creation use a compatible account-first lock order', async () => {
  const a = await account('profile-session-race'),
    learners = new PostgresLearnerRepository();
  for (let n = 0; n < 5; n++) {
    const writes = await Promise.allSettled([
      learners.completeOnboarding(a.id, {
        profile: {
          interfaceLanguage: 'es',
          nativeLanguage: 'es',
          timezone: n % 2 ? 'Europe/Madrid' : 'America/New_York',
          cefrLevel: 'A2',
          interests: [],
        },
        goal: { minutesPerDay: 10, daysPerWeek: 3 },
        consent: {
          purpose: 'local-ai-practice',
          policyVersion: 'privacy-2026-10-05',
          providerDisclosureVersion: 'local-first-2026-10-05',
          accepted: true,
        },
      }),
      repo.create(a.id, {
        scenarioSlug: 'hotel',
        scenarioVersion: 1,
        level: 'A2',
        mode: 'natural',
        promptVersion: 'tutor-v4',
      }),
    ]);
    expect(writes.every((r) => r.status === 'fulfilled')).toBe(true);
  }
  expect(
    await sql('SELECT 1 FROM practice_sessions WHERE account_id=$1', [a.id]),
  ).toHaveLength(5);
});
