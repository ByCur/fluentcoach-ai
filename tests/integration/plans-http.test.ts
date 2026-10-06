import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import cookieParser from 'cookie-parser';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { sql } from '@fluentcoach/infrastructure';
import { AppModule } from '../../apps/api/src/app.module.js';
import { ApiExceptionFilter } from '../../apps/api/src/api-exception.filter.js';
import {
  MemorySessionStore,
  SESSION_STORE,
} from '../../apps/api/src/session.js';
const origin = 'http://localhost:8080';
let app: INestApplication, sessions: MemorySessionStore;
const login = (subject: string) =>
  request(app.getHttpServer())
    .post('/api/v1/auth/synthetic-login')
    .set('Origin', origin)
    .send({ subject });
const cookie = (response: request.Response) =>
  response.headers['set-cookie']![0]!.split(';')[0]!;
async function onboard(response: request.Response) {
  await request(app.getHttpServer())
    .post('/api/v1/onboarding/complete')
    .set('Cookie', cookie(response))
    .set('Origin', origin)
    .set('x-csrf-token', response.body.csrfToken)
    .send({
      profile: {
        interfaceLanguage: 'es',
        nativeLanguage: 'es',
        timezone: 'Europe/Madrid',
        cefrLevel: 'A1',
        interests: [],
      },
      goal: { minutesPerDay: 10, daysPerWeek: 3 },
      consent: {
        purpose: 'local-ai-practice',
        policyVersion: 'privacy-2026-10-05',
        providerDisclosureVersion: 'local-first-2026-10-05',
        accepted: true,
      },
    })
    .expect(201);
}
const post = (user: request.Response, path: string, body: object) =>
  request(app.getHttpServer())
    .post(`/api/v1${path}`)
    .set('Cookie', cookie(user))
    .set('Origin', origin)
    .set('x-csrf-token', user.body.csrfToken)
    .send(body);
beforeAll(async () => {
  sessions = new MemorySessionStore();
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SESSION_STORE)
    .useValue(sessions)
    .compile();
  app = module.createNestApplication();
  app.use(cookieParser());
  app.useGlobalFilters(new ApiExceptionFilter());
  await app.init();
});
beforeEach(async () => {
  sessions.sessions.clear();
  await sql('TRUNCATE accounts CASCADE');
});
afterAll(() => app.close());
describe('M09 authenticated HTTP transport', () => {
  it('isolates read/accept/refresh/skip/start and progress with two accounts', async () => {
    const a = await login('owner'),
      b = await login('attacker');
    await onboard(a);
    await onboard(b);
    const p = (
      await post(a, '/plans/generate', { requestKey: randomUUID() }).expect(201)
    ).body;
    for (const [path, body] of [
      [`/plans/${p.id}/accept`, { expectedVersion: 1 }],
      [
        `/plans/${p.id}/refresh`,
        { expectedVersion: 1, requestKey: randomUUID() },
      ],
      [
        `/plans/${p.id}/activities/${p.activities[0].id}/skip`,
        { expectedVersion: 1 },
      ],
      [
        `/plans/${p.id}/activities/${p.activities[0].id}/start`,
        { expectedVersion: 1 },
      ],
    ] as const)
      await post(b, path, body).expect(404);
    const current = await request(app.getHttpServer())
      .get('/api/v1/plans/current')
      .set('Cookie', cookie(b))
      .expect(200);
    expect(current.body.proposal).toBeNull();
    expect(current.body.active.id).not.toBe(p.id);
    expect(current.body.active.state).toBe('active');
    const ownerId = (
      await sql<{ id: string }>(
        "SELECT id FROM accounts WHERE oidc_subject='owner'",
      )
    )[0]!.id;
    const session = (
      await post(a, '/sessions', {
        scenarioSlug: 'hotel',
        level: 'A1',
        mode: 'natural',
      }).expect(201)
    ).body;
    await post(a, `/sessions/${session.id}/turns`, {
      sourceEventKey: 'active-owner',
      text: 'hello',
      activeDurationMs: 60000,
    }).expect(201);
    const metrics = await request(app.getHttpServer())
      .get(`/api/v1/progress?accountId=${ownerId}`)
      .set('Cookie', cookie(b))
      .expect(200);
    expect(metrics.body.activeMinutes).toBe(0);
    await request(app.getHttpServer()).get('/api/v1/progress').expect(401);
  });
  it('rejects browser ownership, unsupported fields, invalid IDs, CSRF and origin', async () => {
    const a = await login('strict');
    await onboard(a);
    await post(a, '/plans/generate', {
      requestKey: randomUUID(),
      accountId: randomUUID(),
    }).expect(400);
    await post(a, '/plans/generate', {
      requestKey: randomUUID(),
      activityType: 'exam',
    }).expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/plans/generate')
      .set('Cookie', cookie(a))
      .set('Origin', origin)
      .send({ requestKey: randomUUID() })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/plans/generate')
      .set('Cookie', cookie(a))
      .set('Origin', 'https://evil.invalid')
      .set('x-csrf-token', a.body.csrfToken)
      .send({ requestKey: randomUUID() })
      .expect(400);
    await post(a, '/plans/not-a-uuid/accept', { expectedVersion: 1 }).expect(
      400,
    );
  });
  it('maps stale versions to explicit 409 and repeated acceptance stays idempotent', async () => {
    const a = await login('versions');
    await onboard(a);
    const p = (
      await post(a, '/plans/generate', { requestKey: randomUUID() }).expect(201)
    ).body;
    await post(a, `/plans/${p.id}/accept`, { expectedVersion: 999 }).expect(
      409,
    );
    await post(a, `/plans/${p.id}/accept`, { expectedVersion: 1 }).expect(201);
    await post(a, `/plans/${p.id}/accept`, { expectedVersion: 1 }).expect(201);
  });
  it('accepts bounded text telemetry, rejects foreign sessions and does not provide a browser practice-event endpoint', async () => {
    const a = await login('text-owner'),
      b = await login('text-other');
    await onboard(a);
    await onboard(b);
    const s = (
      await post(a, '/sessions', {
        scenarioSlug: 'hotel',
        level: 'A1',
        mode: 'natural',
      })
    ).body;
    await post(b, `/sessions/${s.id}/turns`, {
      sourceEventKey: 'foreign',
      text: 'hello',
      activeDurationMs: 1000,
    }).expect(404);
    await post(a, `/sessions/${s.id}/turns`, {
      sourceEventKey: 'bad',
      text: 'hello',
      activeDurationMs: -1,
    }).expect(400);
    await post(a, `/sessions/${s.id}/turns`, {
      sourceEventKey: 'owned',
      text: 'hello',
      activeDurationMs: 999999,
    }).expect(201);
    await post(a, `/sessions/${s.id}/turns`, {
      sourceEventKey: 'owned',
      text: 'hello',
      activeDurationMs: 999999,
    }).expect(201);
    const metrics = await request(app.getHttpServer())
      .get('/api/v1/progress')
      .set('Cookie', cookie(a))
      .expect(200);
    expect(metrics.body.textMinutes).toBe(5);
    expect(metrics.body.speakingMinutes).toBe(0);
    await post(b, '/practice-events', {
      sessionId: s.id,
      accountId: a.body.accountId,
      durationMs: 300000,
    }).expect(404);
  });
});

it('roadmap ensure uses only the authenticated owner, rejects injected state and protects direct session resume', async () => {
  const a = await login('roadmap-owner'), b = await login('roadmap-other');
  await onboard(a); await onboard(b);
  const active = (await post(a, '/roadmap', {}).expect(201)).body;
  await post(a, '/roadmap', {accountId: randomUUID(), candidateIds: ['exam']}).expect(400);
  await request(app.getHttpServer()).post('/api/v1/roadmap').send({}).expect(401);
  await request(app.getHttpServer()).post('/api/v1/roadmap').set('Cookie', cookie(a)).set('Origin', origin).send({}).expect(400).expect(response => {expect(response.body.error.code).toBe('CSRF_REJECTED');});
  const started = (await post(a, `/plans/${active.id}/activities/${active.activities[0].id}/start`, {expectedVersion: active.version}).expect(201)).body;
  await request(app.getHttpServer()).get(`/api/v1/sessions/${started.sessionId}`).set('Cookie', cookie(a)).expect(200);
  await request(app.getHttpServer()).get(`/api/v1/sessions/${started.sessionId}`).set('Cookie', cookie(b)).expect(404);
  const other = (await post(b, '/roadmap', {}).expect(201)).body;
  expect(other.id).not.toBe(active.id);
  expect(other.activities.every((activity: {sessionId: string | null}) => activity.sessionId === null)).toBe(true);
});
