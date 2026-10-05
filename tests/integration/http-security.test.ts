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
const origin='http://localhost:8080';const db=new pg.Pool({connectionString:process.env.DATABASE_URL});let app:INestApplication;let sessions:MemorySessionStore;
const login=async(subject:string,cookie?:string)=>request(app.getHttpServer()).post('/api/v1/auth/synthetic-login').set('Origin',origin).set(cookie?{Cookie:cookie}:{}).send({subject});
const sessionCookie=(response:request.Response)=>response.headers['set-cookie']![0]!.split(';')[0]!;
beforeAll(async()=>{sessions=new MemorySessionStore();const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(SESSION_STORE).useValue(sessions).compile();app=module.createNestApplication();app.use(cookieParser());app.useGlobalFilters(new ApiExceptionFilter());await app.init();});
beforeEach(async()=>{sessions.sessions.clear();await db.query('TRUNCATE accounts CASCADE');});afterAll(async()=>{await app.close();await db.end();});
describe('M02 HTTP authentication and ownership',()=>{
 it('rejects unauthenticated access',async()=>{await request(app.getHttpServer()).get('/api/v1/me').expect(401);});
 it('authenticates synthetically and rotates an existing session',async()=>{const first=await login('one');expect(first.status).toBe(201);const old=sessionCookie(first);const second=await login('one',old);expect(second.status).toBe(201);expect(sessionCookie(second)).not.toBe(old);expect(sessions.sessions.size).toBe(1);});
 it('invalidates logout',async()=>{const auth=await login('one'),cookie=sessionCookie(auth);await request(app.getHttpServer()).post('/api/v1/auth/logout').set('Cookie',cookie).set('Origin',origin).set('x-csrf-token',auth.body.csrfToken).expect(204);await request(app.getHttpServer()).get('/api/v1/me').set('Cookie',cookie).expect(401);});
 it.each([['idle',31*60_000,false],['absolute',13*60*60_000,true]])('rejects %s expiry',async(_name,age,absolute)=>{const auth=await login('one'),cookie=sessionCookie(auth),id=cookie.split('=')[1]!,s=(await sessions.get(id))!;if(absolute)s.absoluteExpiresAt=Date.now()-1;else s.lastSeenAt=Date.now()-age;await sessions.set(id,s);await request(app.getHttpServer()).get('/api/v1/me').set('Cookie',cookie).expect(401);});
 it('rejects disabled accounts and revokes the session',async()=>{const auth=await login('one'),cookie=sessionCookie(auth);await db.query("UPDATE accounts SET status='DISABLED'");await request(app.getHttpServer()).get('/api/v1/me').set('Cookie',cookie).expect(401);expect(await sessions.get(cookie.split('=')[1]!)).toBeNull();});
 it('rejects missing CSRF and invalid origins',async()=>{const auth=await login('one'),cookie=sessionCookie(auth);await request(app.getHttpServer()).put('/api/v1/practice-goal').set('Cookie',cookie).set('Origin',origin).send({minutesPerDay:10,daysPerWeek:3}).expect(400).expect(r=>expect(r.body.error.code).toBe('CSRF_REJECTED'));await request(app.getHttpServer()).put('/api/v1/practice-goal').set('Cookie',cookie).set('Origin','https://evil.invalid').set('x-csrf-token',auth.body.csrfToken).send({minutesPerDay:10,daysPerWeek:3}).expect(400).expect(r=>expect(r.body.error.code).toBe('INVALID_ORIGIN'));});
 it('rejects invalid IANA timezone without persistence',async()=>{const auth=await login('one'),cookie=sessionCookie(auth);await request(app.getHttpServer()).put('/api/v1/learner-profile').set('Cookie',cookie).set('Origin',origin).set('x-csrf-token',auth.body.csrfToken).send({interfaceLanguage:'es',nativeLanguage:'es',timezone:'Nope/Nope',cefrLevel:'A1',interests:[]}).expect(400).expect(r=>expect(r.body.error.code).toBe('INVALID_TIMEZONE'));expect((await db.query('SELECT * FROM learner_profiles')).rowCount).toBe(0);});
 it('isolates two accounts and rejects guessed ownership fields',async()=>{const a=await login('a'),ca=sessionCookie(a);await request(app.getHttpServer()).put('/api/v1/learner-profile').set('Cookie',ca).set('Origin',origin).set('x-csrf-token',a.body.csrfToken).send({interfaceLanguage:'es',nativeLanguage:'es',timezone:'UTC',cefrLevel:'B1',interests:['viajes']}).expect(200);const accountA=(await db.query<{id:string}>("SELECT id FROM accounts WHERE oidc_subject='a'")).rows[0]!.id;const b=await login('b'),cb=sessionCookie(b);await request(app.getHttpServer()).get('/api/v1/learner-profile').set('Cookie',cb).expect(200).expect(response=>expect(response.text).toBe(''));await request(app.getHttpServer()).put('/api/v1/learner-profile').set('Cookie',cb).set('Origin',origin).set('x-csrf-token',b.body.csrfToken).send({accountId:accountA,interfaceLanguage:'es',nativeLanguage:'es',timezone:'UTC',cefrLevel:'A2',interests:[]}).expect(400);expect((await db.query("SELECT cefr_level FROM learner_profiles WHERE account_id=$1",[accountA])).rows[0]!.cefr_level).toBe('B1');});
 it('bootstraps CSRF for an existing session without exposing its id',async()=>{const auth=await login('one'),cookie=sessionCookie(auth);const response=await request(app.getHttpServer()).get('/api/v1/auth/csrf').set('Cookie',cookie).expect(200);expect(response.body).toEqual({csrfToken:expect.any(String)});expect(JSON.stringify(response.body)).not.toContain(cookie.split('=')[1]!);});
});

const localConsent = {
  purpose: 'local-ai-practice', policyVersion: 'privacy-2026-10-05',
  providerDisclosureVersion: 'local-first-2026-10-05',
};
const legacyConsent = {
  purpose: 'gemini-free-ai-practice', policyVersion: 'privacy-2026-09-29',
  providerDisclosureVersion: 'gemini-free-2026-09-29',
};
const onboarding = {
  profile: { interfaceLanguage: 'es', nativeLanguage: 'es', timezone: 'UTC', cefrLevel: 'A1', interests: [] },
  goal: { minutesPerDay: 10, daysPerWeek: 3 },
};

describe('consent audit history over authenticated HTTP', () => {
  it('stores new local-first onboarding without rewriting historical Gemini consent', async () => {
    const auth = await login('consent-audit'), cookie = sessionCookie(auth);
    const post = (path: string, body: Record<string, unknown>) => request(app.getHttpServer()).post(`/api/v1/${path}`)
      .set('Cookie', cookie).set('Origin', origin).set('x-csrf-token', auth.body.csrfToken).send(body);
    await post('consent', { ...legacyConsent, accepted: true }).expect(201);
    const historical = (await db.query('SELECT * FROM consent_records')).rows[0];
    await post('onboarding/complete', { ...onboarding, consent: { ...localConsent, accepted: true } })
      .expect(201).expect(r => expect(r.body).toEqual({ completed: true, onboardingVersion: 1 }));
    expect((await db.query('SELECT * FROM consent_records WHERE id=$1', [historical.id])).rows[0]).toEqual(historical);
    const history = await request(app.getHttpServer()).get('/api/v1/consent').set('Cookie', cookie).expect(200);
    expect(history.body).toHaveLength(2);
    expect(history.body).toEqual(expect.arrayContaining([
      expect.objectContaining(localConsent), expect.objectContaining(legacyConsent),
    ]));
    const other = await login('consent-other');
    await request(app.getHttpServer()).get('/api/v1/consent').set('Cookie', sessionCookie(other))
      .expect(200).expect(r => expect(r.body).toEqual([]));
  });
  it('keeps historical Gemini onboarding input compatible', async () => {
    const auth = await login('legacy-client');
    await request(app.getHttpServer()).post('/api/v1/onboarding/complete')
      .set('Cookie', sessionCookie(auth)).set('Origin', origin).set('x-csrf-token', auth.body.csrfToken)
      .send({ ...onboarding, consent: { ...legacyConsent, accepted: true } }).expect(201);
    const history = await request(app.getHttpServer()).get('/api/v1/consent').set('Cookie', sessionCookie(auth)).expect(200);
    expect(history.body).toEqual([expect.objectContaining(legacyConsent)]);
  });
  it('rejects all mixed tuples without persisting consent or partial onboarding', async () => {
    const auth = await login('invalid-consent'), cookie = sessionCookie(auth);
    for (const purpose of [localConsent.purpose, legacyConsent.purpose]) {
      for (const policyVersion of [localConsent.policyVersion, legacyConsent.policyVersion]) {
        for (const providerDisclosureVersion of [localConsent.providerDisclosureVersion, legacyConsent.providerDisclosureVersion]) {
          const tuple = { purpose, policyVersion, providerDisclosureVersion };
          if (JSON.stringify(tuple) === JSON.stringify(localConsent) || JSON.stringify(tuple) === JSON.stringify(legacyConsent)) continue;
          const consent = { ...tuple, accepted: true };
          for (const [path, body] of [
            ['consent', consent], ['onboarding/complete', { ...onboarding, consent }],
          ] as const) {
            await request(app.getHttpServer()).post(`/api/v1/${path}`)
              .set('Cookie', cookie).set('Origin', origin).set('x-csrf-token', auth.body.csrfToken)
              .send(body).expect(400).expect(r => expect(r.body.error.code).toBe('VALIDATION_ERROR'));
          }
        }
      }
    }
    for (const table of ['consent_records', 'learner_profiles', 'practice_goals']) {
      expect((await db.query(`SELECT * FROM ${table}`)).rowCount).toBe(0);
    }
  });
});
