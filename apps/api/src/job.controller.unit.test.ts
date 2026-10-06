import 'reflect-metadata';
import { createHash,createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrivacyService } from '@fluentcoach/application';
import { JobController } from './job.controller.js';
import { JOB_SERVICE } from './tokens.js';
import { ApiExceptionFilter } from './api-exception.filter.js';
const current='synthetic-current-signing-key-32-bytes', next='synthetic-next-signing-key-32-bytes', origin='https://api.test';
const jobs={execute: vi.fn().mockResolvedValue('succeeded'),reconcile: vi.fn().mockResolvedValue(undefined)};
const privacy={execute:vi.fn().mockResolvedValue(undefined),retain:vi.fn().mockResolvedValue({accounts:0,sessions:0})};
const job={version:1,analysisRunId:'00000000-0000-4000-8000-000000000001',accountId:'00000000-0000-4000-8000-000000000002',sessionId:'00000000-0000-4000-8000-000000000003',transcriptRevision:1};
let app:INestApplication;
function signature(body:string,path:string,key=current,expired=false){const header=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');const payload=Buffer.from(JSON.stringify({body:createHash('sha256').update(body).digest('base64url'),iss:'Upstash',sub:origin+path,nbf:Math.floor(Date.now()/1000)-120,exp:Math.floor(Date.now()/1000)+(expired?-60:60)})).toString('base64url');const token=`${header}.${payload}`;return `${token}.${createHmac('sha256',key).update(token).digest('base64url')}`}
beforeAll(async()=>{vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY',current);vi.stubEnv('QSTASH_NEXT_SIGNING_KEY',next);vi.stubEnv('PUBLIC_ORIGIN',origin);const module=await Test.createTestingModule({controllers:[JobController],providers:[{provide:JOB_SERVICE,useValue:jobs},{provide:PrivacyService,useValue:privacy}]}).compile();app=module.createNestApplication({rawBody:true});app.useGlobalFilters(new ApiExceptionFilter());await app.init()});
afterAll(async()=>{await app.close();vi.unstubAllEnvs()});
describe('QStash signed HTTP boundary',()=>{
 it.each(['/api/v1/jobs/analysis','/api/v1/jobs/reconcile'])('accepts both keys at %s using exact raw bytes',async path=>{const body=path.endsWith('analysis')?JSON.stringify(job,null,2):'{ "synthetic": true }';for(const key of[current,next])await request(app.getHttpServer()).post(path).set('Content-Type','application/json').set('upstash-signature',signature(body,path,key)).send(body).expect(204)});
 it('rejects cross-endpoint replay, changed body, expiry, invalid signature and unsigned reconcile before dispatch',async()=>{const path='/api/v1/jobs/reconcile',body='{}';const before=jobs.reconcile.mock.calls.length;const signatures=[signature(body,'/api/v1/jobs/analysis'),signature('{ "x": 1 }',path),signature(body,path,current,true),signature(body,path,'untrusted-synthetic-key-32-bytes'),'invalid'];for(const token of signatures)await request(app.getHttpServer()).post(path).set('Content-Type','application/json').set('upstash-signature',token).send(body).expect(401);await request(app.getHttpServer()).post(path).send({}).expect(401);expect(jobs.reconcile.mock.calls).toHaveLength(before)});
 it('validates the versioned job envelope after verifying the signature',async()=>{const path='/api/v1/jobs/analysis';const before=jobs.execute.mock.calls.length;for(const invalid of [{...job,version:2},{...job,accountId:'forged'},{...job,transcriptRevision:0},{...job,extra:true}]){const body=JSON.stringify(invalid);await request(app.getHttpServer()).post(path).set('Content-Type','application/json').set('upstash-signature',signature(body,path)).send(body).expect(400)}expect(jobs.execute.mock.calls).toHaveLength(before)});
 it.each(['/api/v1/jobs/privacy','/api/v1/jobs/retention'])('privacy workers verify both signing keys and refuse replay at %s',async path=>{const body=path.endsWith('privacy')?JSON.stringify({version:'privacy-job-v1',id:job.analysisRunId}):JSON.stringify({version:'retention-v1'});for(const key of [current,next])await request(app.getHttpServer()).post(path).set('Content-Type','application/json').set('upstash-signature',signature(body,path,key)).send(body).expect(204);await request(app.getHttpServer()).post(path).set('Content-Type','application/json').set('upstash-signature',signature(body,'/api/v1/jobs/analysis')).send(body).expect(401);await request(app.getHttpServer()).post(path).send({}).expect(401);});
 it('fails closed when signing keys are unavailable',async()=>{vi.stubEnv('QSTASH_NEXT_SIGNING_KEY','');try{await request(app.getHttpServer()).post('/api/v1/jobs/reconcile').send({}).expect(503)}finally{vi.stubEnv('QSTASH_NEXT_SIGNING_KEY',next)}});
});
