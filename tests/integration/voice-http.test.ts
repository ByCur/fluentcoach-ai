import 'reflect-metadata';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AiError, type SpeechTranscriber } from '@fluentcoach/application';
import { AppModule } from '../../apps/api/src/app.module.js';
import { ApiExceptionFilter } from '../../apps/api/src/api-exception.filter.js';
import { MemorySessionStore, SESSION_STORE } from '../../apps/api/src/session.js';
import { SPEECH_TRANSCRIBER } from '../../apps/api/src/tokens.js';
import { resetDatabase } from '../support/database.js';

const origin = 'http://localhost:8080';
let app: INestApplication;
let transcriberError: AiError | undefined;
const transcriber: SpeechTranscriber = {
  provider: 'fake',
  transcribe: () =>
    transcriberError
      ? Promise.reject(transcriberError)
      : Promise.resolve({ transcript: 'A spoken synthetic request', elapsedMs: 1 }),
};

beforeAll(async () => {
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SESSION_STORE)
    .useValue(new MemorySessionStore())
    .overrideProvider(SPEECH_TRANSCRIBER)
    .useValue(transcriber)
    .compile();
  app = module.createNestApplication();
  app.use(cookieParser());
  app.useGlobalFilters(new ApiExceptionFilter());
  await app.init();
});
beforeEach(async () => {
  transcriberError = undefined;
  await resetDatabase();
});
afterAll(() => app.close());

async function identity(subject: string) {
  const auth = await request(app.getHttpServer())
    .post('/api/v1/auth/synthetic-login')
    .set('Origin', origin)
    .send({ subject })
    .expect(201);
  const cookie = (auth.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
  const headers = {
    Cookie: cookie,
    Origin: origin,
    'x-csrf-token': String(auth.body.csrfToken),
  };
  await request(app.getHttpServer()).put('/api/v1/learner-profile').set(headers)
    .send({ interfaceLanguage: 'es', nativeLanguage: 'es', timezone: 'UTC', cefrLevel: 'A2', interests: [] });
  return headers;
}
async function start(headers: Record<string, string>) {
  return request(app.getHttpServer()).post('/api/v1/sessions').set(headers)
    .send({ scenarioSlug: 'hotel', level: 'B1', mode: 'natural' }).expect(201);
}
function voice(id: string, headers?: Record<string, string>) {
  const call = request(app.getHttpServer()).post(`/api/v1/sessions/${id}/voice-turns`);
  if (headers) call.set(headers);
  return call.field('sourceEventKey', crypto.randomUUID()).field('durationMs', '1000')
    .attach('audio', Buffer.from('synthetic audio'), { filename: 'turn.webm', contentType: 'audio/webm' });
}

describe('M06 voice-turn API security and failure behavior', () => {
  it('rejects unauthenticated and foreign sessions', async () => {
    const a = await identity('voice-a'), b = await identity('voice-b');
    const session = await start(a);
    await voice(session.body.id).expect(401);
    await voice(session.body.id, b).expect(404);
  });
  it('persists a transcription through the normal turn path and rejects ended sessions', async () => {
    const a = await identity('voice-owner'), session = await start(a);
    const response = await voice(session.body.id, a).expect(201);
    expect(response.body.turns.map((turn: { text: string }) => turn.text)).toContain('A spoken synthetic request');
    await request(app.getHttpServer()).post(`/api/v1/sessions/${session.body.id}/end`).set(a).expect(201);
    await voice(session.body.id, a).expect(409);
  });
  it('rejects unsupported MIME and oversized audio before transcription', async () => {
    const a = await identity('voice-limits'), session = await start(a);
    await request(app.getHttpServer()).post(`/api/v1/sessions/${session.body.id}/voice-turns`).set(a)
      .field('sourceEventKey', crypto.randomUUID()).field('durationMs', '1000')
      .attach('audio', Buffer.from('text'), { filename: 'turn.txt', contentType: 'text/plain' }).expect(400);
    await request(app.getHttpServer()).post(`/api/v1/sessions/${session.body.id}/voice-turns`).set(a)
      .field('sourceEventKey', crypto.randomUUID()).field('durationMs', '1000')
      .attach('audio', Buffer.alloc(8 * 1024 * 1024 + 1), { filename: 'turn.webm', contentType: 'audio/webm' }).expect(413);
  });
  it.each(['unavailable', 'timeout'] as const)('normalizes transcriber %s', async (code) => {
    const a = await identity(`voice-${code}`), session = await start(a);
    transcriberError = new AiError(code);
    const response = await voice(session.body.id, a).expect(503);
    expect(response.body.error.code).toBe(code);
  });
});
