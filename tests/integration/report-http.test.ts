import 'reflect-metadata';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { JobService } from '@fluentcoach/application';
import { sql } from '@fluentcoach/infrastructure';
import { AppModule } from '../../apps/api/src/app.module.js';
import { ApiExceptionFilter } from '../../apps/api/src/api-exception.filter.js';
import {
  MemorySessionStore,
  SESSION_STORE,
} from '../../apps/api/src/session.js';
import { JOB_SERVICE } from '../../apps/api/src/tokens.js';
let app: INestApplication;
let jobs: JobService;
const origin = 'http://localhost:8080';
beforeAll(async () => {
  expect(
    process.env['DATABASE_URL'],
    'report HTTP gate requires PostgreSQL',
  ).toBeTruthy();
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SESSION_STORE)
    .useValue(new MemorySessionStore())
    .compile();
  app = module.createNestApplication();
  app.use(cookieParser());
  app.useGlobalFilters(new ApiExceptionFilter());
  await app.init();
  jobs = module.get<JobService>(JOB_SERVICE);
});
afterAll(() => app.close());
async function login() {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/synthetic-login')
    .set('Origin', origin)
    .send({ subject: `synthetic-report-http-${randomUUID()}` })
    .expect(201);
  return {
    cookie: response.headers['set-cookie']![0]!.split(';')[0]!,
    csrf: response.body.csrfToken as string,
  };
}
it('protects reports with authentication, ownership, CSRF and origin checks and returns cited content', async () => {
  const a = await login(),
    b = await login();
  await request(app.getHttpServer())
    .put('/api/v1/learner-profile')
    .set('Cookie', a.cookie)
    .set('Origin', origin)
    .set('x-csrf-token', a.csrf)
    .send({
      interfaceLanguage: 'es',
      nativeLanguage: 'es',
      timezone: 'UTC',
      cefrLevel: 'A1',
      interests: [],
    })
    .expect(200);
  const created = await request(app.getHttpServer())
    .post('/api/v1/sessions')
    .set('Cookie', a.cookie)
    .set('Origin', origin)
    .set('x-csrf-token', a.csrf)
    .send({ scenarioSlug: 'hotel', level: 'A1', mode: 'natural' })
    .expect(201);
  const id = created.body.id as string;
  await request(app.getHttpServer())
    .post(`/api/v1/sessions/${id}/turns`)
    .set('Cookie', a.cookie)
    .set('Origin', origin)
    .set('x-csrf-token', a.csrf)
    .send({ sourceEventKey: 'synthetic', text: 'I need a room' })
    .expect(201);
  await request(app.getHttpServer())
    .post(`/api/v1/sessions/${id}/end`)
    .set('Cookie', a.cookie)
    .set('Origin', origin)
    .set('x-csrf-token', a.csrf)
    .expect(201);
  const row = (
    await sql<{ id: string; account_id: string; transcript_revision: number }>(
      'SELECT id,account_id,transcript_revision FROM analysis_runs WHERE session_id=$1',
      [id],
    )
  )[0]!;
  await jobs.execute({
    version: 1,
    analysisRunId: row.id,
    accountId: row.account_id,
    sessionId: id,
    transcriptRevision: row.transcript_revision,
  });
  await request(app.getHttpServer())
    .get(`/api/v1/sessions/${id}/report`)
    .expect(401);
  await request(app.getHttpServer())
    .get(`/api/v1/sessions/${id}/report`)
    .set('Cookie', b.cookie)
    .expect(404)
    .expect((response) => expect(response.text).not.toContain('I need a room'));
  await request(app.getHttpServer())
    .post(`/api/v1/sessions/${id}/report/retry`)
    .set('Cookie', b.cookie)
    .set('Origin', origin)
    .set('x-csrf-token', b.csrf)
    .expect(404);
  await request(app.getHttpServer())
    .post(`/api/v1/sessions/${id}/report/retry`)
    .set('Cookie', a.cookie)
    .set('Origin', origin)
    .expect(400);
  await request(app.getHttpServer())
    .post(`/api/v1/sessions/${id}/report/retry`)
    .set('Cookie', a.cookie)
    .set('Origin', 'https://evil.invalid')
    .set('x-csrf-token', a.csrf)
    .expect(400);
  await request(app.getHttpServer())
    .get(`/api/v1/sessions/${id}/report`)
    .set('Cookie', a.cookie)
    .expect(200)
    .expect((response) => {
      expect(response.body.status).toBe('succeeded');
      expect(response.body.report.strengths[0].evidence[0]).toMatchObject({
        turnSequence: 1,
        quote: 'I need a room',
      });
    });
  await sql('DELETE FROM accounts WHERE id=$1', [row.account_id]);
});
