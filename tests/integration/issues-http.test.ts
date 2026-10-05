import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import {
  ConversationService,
  JobService,
  ReportService,
} from '@fluentcoach/application';
import {
  PostgresJobStore,
  PostgresReportRepository,
  PostgresSessionRepository,
  sql,
} from '@fluentcoach/infrastructure';
import {
  FakeConversationProvider,
  FakeSessionAnalyzer,
} from '@fluentcoach/testing';
import { AppModule } from '../../apps/api/src/app.module.js';
import { ApiExceptionFilter } from '../../apps/api/src/api-exception.filter.js';
import {
  MemorySessionStore,
  SESSION_STORE,
} from '../../apps/api/src/session.js';
import { envelope } from '../support/database.js';
let app: INestApplication;
const origin = 'http://localhost:8080';
beforeAll(async () => {
  expect(
    process.env['DATABASE_URL'],
    'issues HTTP gate requires PostgreSQL',
  ).toBeTruthy();
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SESSION_STORE)
    .useValue(new MemorySessionStore())
    .compile();
  app = module.createNestApplication();
  app.use(cookieParser());
  app.useGlobalFilters(new ApiExceptionFilter());
  await app.init();
});
afterAll(async () => {
  await app?.close();
});
async function login() {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/synthetic-login')
    .set('Origin', origin)
    .send({ subject: `issues-http-${randomUUID()}` })
    .expect(201);
  const cookie = response.headers['set-cookie']![0]!.split(';')[0]!;
  const me = await request(app.getHttpServer())
    .get('/api/v1/me')
    .set('Cookie', cookie)
    .expect(200);
  return {
    cookie,
    csrf: response.body.csrfToken as string,
    id: me.body.id as string,
  };
}
async function seed(owner: string, suffix: string) {
  await sql(
    "INSERT INTO learner_profiles(account_id,interface_language,native_language,timezone,cefr_level,interests)VALUES($1,'es','es','UTC','A1','{}')",
    [owner],
  );
  const store = new PostgresJobStore(),
    conversation = new ConversationService(
      new PostgresSessionRepository(),
      new FakeConversationProvider(),
      store,
    );
  const jobs = new JobService(
    store,
    { enqueue: () => Promise.resolve() },
    new ReportService(
      new PostgresReportRepository(true),
      new FakeSessionAnalyzer(),
    ),
  );
  for (const count of [2, 1]) {
    const session = await conversation.start(owner, {
      scenarioSlug: 'hotel',
      level: 'A1',
      mode: 'natural',
    });
    for (let i = 0; i < count; i++)
      await conversation.turn(
        owner,
        session.id,
        `turn-${i}`,
        `Yesterday I go ${suffix} ${i}`,
      );
    const result = await store.finalize({
      accountId: owner,
      sessionId: session.id,
      hasTurns: true,
    });
    await jobs.execute(envelope(result.run));
  }
}
it('isolates read, evidence, dismiss and restore under adversarial two-account transport', async () => {
  const a = await login(),
    b = await login();
  await seed(a.id, 'OWNER_A_ONLY');
  const get = (path: string, cookie: string) =>
    request(app.getHttpServer()).get(path).set('Cookie', cookie);
  const action = (key: string, verb: string, cookie: string, csrf: string) =>
    request(app.getHttpServer())
      .post(`/api/v1/issues/${key}/${verb}`)
      .set('Cookie', cookie)
      .set('Origin', origin)
      .set('x-csrf-token', csrf);
  await request(app.getHttpServer()).get('/api/v1/issues').expect(401);
  await get('/api/v1/issues', b.cookie)
    .expect(200)
    .expect((r) => expect(r.body).toEqual([]));
  await get('/api/v1/issues/verb-tense/evidence', b.cookie)
    .expect(404)
    .expect((r) => expect(r.text).not.toContain('OWNER_A_ONLY'));
  for (const verb of ['dismiss', 'restore']) {
    await action('verb-tense', verb, b.cookie, b.csrf).expect(404);
    await action('verb-tense', verb, b.cookie, b.csrf)
      .send({ accountId: a.id })
      .expect(400);
  }
  await get(`/api/v1/issues?accountId=${a.id}`, b.cookie).expect(400);
  await get(
    `/api/v1/issues/verb-tense/evidence?accountId=${a.id}`,
    b.cookie,
  ).expect(400);
  await get('/api/v1/issues/not-a-key/evidence', a.cookie).expect(400);
  await get(`/api/v1/issues/${a.id}/evidence`, b.cookie).expect(400);
  await request(app.getHttpServer())
    .post('/api/v1/issues/verb-tense/dismiss')
    .set('Cookie', a.cookie)
    .set('Origin', origin)
    .expect(400);
  await request(app.getHttpServer())
    .post('/api/v1/issues/verb-tense/dismiss')
    .set('Cookie', a.cookie)
    .set('Origin', 'https://evil.invalid')
    .set('x-csrf-token', a.csrf)
    .expect(400);
  await seed(b.id, 'OWNER_B_ONLY');
  await action('verb-tense', 'dismiss', b.cookie, b.csrf).send({}).expect(201);
  await get('/api/v1/issues', a.cookie)
    .expect(200)
    .expect((r) => {
      expect(r.body[0].dismissed).toBe(false);
      expect(r.text).not.toContain('OWNER_B_ONLY');
    });
  await action('verb-tense', 'dismiss', a.cookie, a.csrf).send({}).expect(201);
  await action('verb-tense', 'restore', b.cookie, b.csrf).send({}).expect(201);
  await get('/api/v1/issues', a.cookie)
    .expect(200)
    .expect((r) => expect(r.body[0].dismissed).toBe(true));
  await get('/api/v1/issues/verb-tense/evidence', b.cookie)
    .expect(200)
    .expect((r) => {
      expect(r.text).toContain('OWNER_B_ONLY');
      expect(r.text).not.toContain('OWNER_A_ONLY');
    });
  await action('verb-tense', 'restore', a.cookie, a.csrf).send({}).expect(201);
  await get('/api/v1/issues', a.cookie)
    .expect(200)
    .expect((r) => expect(r.body[0].dismissed).toBe(false));
  await sql('DELETE FROM accounts WHERE id=ANY($1::uuid[])', [[a.id, b.id]]);
});
