import 'reflect-metadata';
import { afterAll,beforeAll,beforeEach,describe,expect,it } from 'vitest';
import cookieParser from 'cookie-parser';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import pg from 'pg';
import { AppModule } from '../../apps/api/src/app.module.js';
import { ApiExceptionFilter } from '../../apps/api/src/api-exception.filter.js';
import { MemorySessionStore,SESSION_STORE } from '../../apps/api/src/session.js';

const origin='http://localhost:8080',db=new pg.Pool({connectionString:process.env.DATABASE_URL});
let app:INestApplication,sessions:MemorySessionStore;
const login=(subject:string)=>request(app.getHttpServer()).post('/api/v1/auth/synthetic-login').set('Origin',origin).send({subject});
const cookie=(response:request.Response)=>response.headers['set-cookie']![0]!.split(';')[0]!;
async function insertSuggestion(accountId:string){return (await db.query<{id:string}>(`INSERT INTO vocabulary_suggestions(account_id,phrase,normalized_phrase,meaning,normalized_sense,evidence,origin_version) VALUES($1,'Take a seat','take a seat','Please sit down','please sit down','{}','vocabulary-suggestion-v1') RETURNING id`,[accountId])).rows[0]!.id;}

beforeAll(async()=>{sessions=new MemorySessionStore();const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(SESSION_STORE).useValue(sessions).compile();app=module.createNestApplication();app.use(cookieParser());app.useGlobalFilters(new ApiExceptionFilter());await app.init();});
beforeEach(async()=>{sessions.sessions.clear();await db.query('TRUNCATE accounts CASCADE');});
afterAll(async()=>{await app.close();await db.end();});

describe('M08 HTTP ownership and mutation security',()=>{
  it('rejects cross-account suggestion actions and browser ownership fields',async()=>{
    const owner=await login('http-owner'),attacker=await login('http-attacker');
    const ownerId=(await db.query<{id:string}>("SELECT id FROM accounts WHERE oidc_subject='http-owner'")).rows[0]!.id,suggestion=await insertSuggestion(ownerId);
    for(const action of ['confirm','ignore']) await request(app.getHttpServer()).post(`/api/v1/vocabulary/suggestions/${suggestion}/${action}`).set('Cookie',cookie(attacker)).set('Origin',origin).set('x-csrf-token',attacker.body.csrfToken).send({}).expect(404);
    await request(app.getHttpServer()).post(`/api/v1/vocabulary/suggestions/${suggestion}/confirm`).set('Cookie',cookie(owner)).set('Origin',origin).set('x-csrf-token',owner.body.csrfToken).send({accountId:ownerId}).expect(400);
  });

  it('rejects cross-account card review/history and enforces CSRF/origin',async()=>{
    const owner=await login('http-card-owner'),attacker=await login('http-card-attacker');
    const ownerId=(await db.query<{id:string}>("SELECT id FROM accounts WHERE oidc_subject='http-card-owner'")).rows[0]!.id,suggestion=await insertSuggestion(ownerId);
    await request(app.getHttpServer()).post(`/api/v1/vocabulary/suggestions/${suggestion}/confirm`).set('Cookie',cookie(owner)).set('Origin',origin).send({}).expect(400);
    await request(app.getHttpServer()).post(`/api/v1/vocabulary/suggestions/${suggestion}/confirm`).set('Cookie',cookie(owner)).set('Origin','https://evil.invalid').set('x-csrf-token',owner.body.csrfToken).send({}).expect(400);
    const confirmed=await request(app.getHttpServer()).post(`/api/v1/vocabulary/suggestions/${suggestion}/confirm`).set('Cookie',cookie(owner)).set('Origin',origin).set('x-csrf-token',owner.body.csrfToken).send({}).expect(201);
    const review={rating:'good',reviewKey:'11111111-1111-4111-8111-111111111111',expectedVersion:1};
    await request(app.getHttpServer()).post(`/api/v1/vocabulary/cards/${confirmed.body.id}/reviews`).set('Cookie',cookie(attacker)).set('Origin',origin).set('x-csrf-token',attacker.body.csrfToken).send(review).expect(404);
    await request(app.getHttpServer()).get(`/api/v1/vocabulary/cards/${confirmed.body.id}/history`).set('Cookie',cookie(attacker)).expect(404);
  });

  it('maps stale versions to HTTP 409',async()=>{
    const owner=await login('http-stale'),ownerId=(await db.query<{id:string}>("SELECT id FROM accounts WHERE oidc_subject='http-stale'")).rows[0]!.id,suggestion=await insertSuggestion(ownerId);
    const card=await request(app.getHttpServer()).post(`/api/v1/vocabulary/suggestions/${suggestion}/confirm`).set('Cookie',cookie(owner)).set('Origin',origin).set('x-csrf-token',owner.body.csrfToken).send({}).expect(201);
    await request(app.getHttpServer()).post(`/api/v1/vocabulary/cards/${card.body.id}/reviews`).set('Cookie',cookie(owner)).set('Origin',origin).set('x-csrf-token',owner.body.csrfToken).send({rating:'good',reviewKey:'22222222-2222-4222-8222-222222222222',expectedVersion:99}).expect(409).expect(r=>expect(r.body.error.code).toBe('STALE_CARD_VERSION'));
  });
});
