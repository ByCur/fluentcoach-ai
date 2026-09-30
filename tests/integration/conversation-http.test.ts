import 'reflect-metadata';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../../apps/api/src/app.module.js';
import { ApiExceptionFilter } from '../../apps/api/src/api-exception.filter.js';
import { MemorySessionStore, SESSION_STORE } from '../../apps/api/src/session.js';
import { resetDatabase } from '../support/database.js';
const origin='http://localhost:8080';
let app: INestApplication, base: string;
beforeAll(async()=>{const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(SESSION_STORE).useValue(new MemorySessionStore()).compile();app=module.createNestApplication();app.use(cookieParser());app.useGlobalFilters(new ApiExceptionFilter());await app.listen(0,'127.0.0.1');base=await app.getUrl()});
beforeEach(resetDatabase);
afterAll(async()=>{await app.close()});
async function identity(subject:string){const auth=await request(app.getHttpServer()).post('/api/v1/auth/synthetic-login').set('Origin',origin).send({subject}).expect(201);const cookie=(auth.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;const headers={Cookie:cookie,Origin:origin,'x-csrf-token':String(auth.body.csrfToken)};await request(app.getHttpServer()).put('/api/v1/learner-profile').set(headers).send({interfaceLanguage:'es',nativeLanguage:'es',timezone:'UTC',cefrLevel:'A2',interests:[]}).expect(200);return headers}
async function start(headers:Record<string,string>){return request(app.getHttpServer()).post('/api/v1/sessions').set(headers).send({scenarioSlug:'hotel',level:'B1',mode:'teaching'}).expect(201)}
describe('M03 authenticated SSE HTTP transport',()=>{
 it('rejects a second account before SSE headers and rejects guessed ownership fields and invalid cursors',async()=>{const a=await identity('a'),b=await identity('b'),s=await start(a),id=String(s.body.id);await request(app.getHttpServer()).get(`/api/v1/sessions/${id}/events`).expect(401);await request(app.getHttpServer()).get(`/api/v1/sessions/${id}/events`).set(b).expect(404).expect('content-type',/json/);for(const cursor of['-1','NaN','1.2','9007199254740992'])await request(app.getHttpServer()).get(`/api/v1/sessions/${id}/events?cursor=${cursor}`).set(a).expect(400);await request(app.getHttpServer()).post('/api/v1/sessions').set(b).send({scenarioSlug:'hotel',level:'B1',mode:'teaching',accountId:s.body.accountId}).expect(400)});
 it('streams delayed deltas while the POST is pending and honors Last-Event-ID over the original URL cursor',async()=>{const a=await identity('a'),s=await start(a),id=String(s.body.id);const abort=new AbortController();const response=await fetch(`${base}/api/v1/sessions/${id}/events?cursor=0`,{headers:{Cookie:a.Cookie},signal:abort.signal});expect(response.status).toBe(200);expect(response.headers.get('x-accel-buffering')).toBe('no');const reader=response.body!.getReader();let completed=false;const turn=request(app.getHttpServer()).post(`/api/v1/sessions/${id}/turns`).set(a).send({sourceEventKey:'streamed-turn',text:'Synthetic room request'}).then(r=>{completed=true;return r});let prefix='';while(!prefix.includes('id: 1\n')){const chunk=await reader.read();prefix+=new TextDecoder().decode(chunk.value)}expect(completed).toBe(false);expect(prefix).not.toContain('turn.completed');abort.abort();const resumeAbort=new AbortController();const resumed=await fetch(`${base}/api/v1/sessions/${id}/events?cursor=0`,{headers:{Cookie:a.Cookie,'Last-Event-ID':'1'},signal:resumeAbort.signal});const resumedReader=resumed.body!.getReader();let tail='';try{while(!tail.includes('turn.completed')){const chunk=await resumedReader.read();tail+=new TextDecoder().decode(chunk.value)}}finally{resumeAbort.abort()}expect(tail.match(/^id: \d+/gm)).toEqual(['id: 2','id: 3','id: 4']);expect((await turn).status).toBe(201)});
});
