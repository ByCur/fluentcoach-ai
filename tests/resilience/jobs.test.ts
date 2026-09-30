import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { JobService, type AnalysisJob, type AnalysisRun, type JobTransport } from '@fluentcoach/application';
import { PostgresJobStore, sql } from '@fluentcoach/infrastructure';
import { account, envelope, resetDatabase, session } from '../support/database.js';
const provider = {analyze: () => Promise.resolve({providerRunId: randomUUID()})};
class Transport implements JobTransport {
  down = false; jobs: AnalysisJob[] = [];
  enqueue(job: AnalysisJob) { if (this.down) return Promise.reject(new Error('synthetic outage')); this.jobs.push(job); return Promise.resolve(); }
}
async function fixture() {
  const a = await account('resilience'), s = await session(a.id), store = new PostgresJobStore();
  return {store, job: envelope((await store.finalize({accountId: a.id, sessionId: s.id, hasTurns: true})).run)};
}
beforeEach(resetDatabase);
describe('M04 recovery against real PostgreSQL', () => {
  it('survives queue outage and a fresh API/job service, and records one effect across concurrent duplicates', async () => {
    const {store,job} = await fixture(), transport = new Transport(); transport.down = true;
    await expect(new JobService(store,transport,provider).dispatch()).rejects.toThrow('JOB_DISPATCH_UNAVAILABLE');
    expect(await new PostgresJobStore().pending()).toEqual([job]);
    transport.down = false;
    await new JobService(new PostgresJobStore(),transport,provider).reconcile();
    expect(transport.jobs).toEqual([job]);
    let calls = 0;
    const countingProvider = {analyze: () => { calls++; return provider.analyze(); }};
    const results = await Promise.all(Array.from({length: 12}, () => new JobService(new PostgresJobStore(),transport,countingProvider).execute(job)));
    expect(results.filter(r => r === 'succeeded')).toHaveLength(1);
    expect(calls).toBe(1);
    expect(await sql('SELECT * FROM provider_runs')).toHaveLength(1);
    expect(await new PostgresJobStore().pending()).toEqual([]);
  });
  it('recovers a published wake-up that never arrived and a crashed worker with an expired lease', async () => {
    const {store,job} = await fixture(), transport = new Transport();
    await new JobService(store,transport,provider).dispatch();
    expect(await store.pending()).toEqual([]);
    await sql("UPDATE outbox_events SET published_at=now()-interval '31 seconds'");
    await new JobService(new PostgresJobStore(),transport,provider).reconcile();
    expect(transport.jobs).toEqual([job,job]);
    await store.claim(job,new Date(0),new Date(30000),3);
    expect(await new PostgresJobStore().pending()).toEqual([job]);
    const recovered = new JobService(new PostgresJobStore(),transport,provider);
    await recovered.reconcile();
    expect(await recovered.execute(job)).toBe('succeeded');
    expect((await sql('SELECT attempts,status FROM analysis_runs'))[0]).toMatchObject({attempts: 2,status: 'SUCCEEDED'});
    expect(await sql('SELECT * FROM provider_runs')).toHaveLength(1);
  });
  it('reopens the outbox after a provider failure and permanently exhausts retries', async () => {
    const {store,job} = await fixture(), transport = new Transport(); let calls = 0;
    const failing = {analyze: () => { calls++; return Promise.reject(new Error('synthetic learner content must not enter error codes')); }};
    for (let attempt=0;attempt<3;attempt++) {
      const fresh = new JobService(new PostgresJobStore(),transport,failing);
      await fresh.dispatch();
      expect(await fresh.execute(job)).toBe('failed');
      if (attempt<2) expect(await store.pending()).toEqual([job]);
    }
    const fresh = new JobService(new PostgresJobStore(),transport,failing);
    expect(await fresh.execute(job)).toBe('duplicate');
    expect(calls).toBe(3);
    expect(await store.pending()).toEqual([]);
    expect((await sql('SELECT attempts,status,error_code FROM analysis_runs'))[0]).toMatchObject({attempts: 3,status: 'FAILED',error_code: 'ANALYSIS_ATTEMPT_FAILED'});
    expect(await sql('SELECT * FROM provider_runs')).toHaveLength(0);
  });
  it('bounds repeated crashed-worker leases as well as caught errors', async () => {
    const {store,job} = await fixture();
    for (let attempt=0;attempt<3;attempt++) expect(await store.claim(job,new Date(attempt*31000),new Date(attempt*31000+30000),3)).not.toBeNull();
    expect(await new PostgresJobStore().claim(job,new Date(93000),new Date(123000),3)).toBeNull();
    expect((await sql('SELECT attempts,status,error_code FROM analysis_runs'))[0]).toMatchObject({attempts: 3,status: 'FAILED',error_code: 'RETRIES_EXHAUSTED'});
  });
  it('rolls back a provider effect when the DB fails after a provider response, then retries persistently', async () => {
    const {store,job} = await fixture(), transport = new Transport(); let calls = 0;
    const counting = {analyze: () => { calls++; return provider.analyze(); }};
    await sql("ALTER TABLE provider_runs ADD CONSTRAINT synthetic_provider_failure CHECK(outcome <> 'succeeded')");
    try { expect(await new JobService(store,transport,counting).execute(job)).toBe('failed'); }
    finally { await sql('ALTER TABLE provider_runs DROP CONSTRAINT synthetic_provider_failure'); }
    expect(await sql('SELECT * FROM provider_runs')).toHaveLength(0);
    expect((await sql('SELECT status FROM analysis_runs'))[0]!.status).toBe('PENDING');
    const fresh = new JobService(new PostgresJobStore(),transport,counting);
    await fresh.reconcile();
    expect(await fresh.execute(job)).toBe('succeeded');
    expect(calls).toBe(2); // External execution is at least once; persisted effect is unique.
    expect(await sql('SELECT * FROM provider_runs')).toHaveLength(1);
  });
  it('does not overwrite a committed success when the DB acknowledgment is lost', async () => {
    const {job} = await fixture(), transport = new Transport();
    class AmbiguousStore extends PostgresJobStore {
      override async succeed(run: AnalysisRun, id: string) { await super.succeed(run,id); throw new Error('synthetic lost COMMIT acknowledgment'); }
    }
    expect(await new JobService(new AmbiguousStore(),transport,provider).execute(job)).toBe('failed');
    expect(await new JobService(new PostgresJobStore(),transport,provider).execute(job)).toBe('duplicate');
    expect((await sql('SELECT status,error_code FROM analysis_runs'))[0]).toMatchObject({status: 'SUCCEEDED',error_code: null});
    expect(await sql('SELECT * FROM provider_runs')).toHaveLength(1);
    expect(await new PostgresJobStore().pending()).toEqual([]);
  });
  it('fences stale workers so neither a late result nor a late failure can replace a newer lease', async () => {
    const {store,job} = await fixture();
    const old = (await store.claim(job,new Date(0),new Date(30000),3))!;
    const fresh = (await new PostgresJobStore().claim(job,new Date(31000),new Date(61000),3))!;
    await expect(store.succeed(old,randomUUID())).rejects.toThrow('JOB_LEASE_LOST');
    await store.fail(old,'STALE',true);
    expect((await sql('SELECT attempts,status FROM analysis_runs'))[0]).toMatchObject({attempts: 2,status: 'RUNNING'});
    await new PostgresJobStore().succeed(fresh,randomUUID());
    await store.fail(old,'STALE',true);
    expect((await sql('SELECT status,error_code FROM analysis_runs'))[0]).toMatchObject({status: 'SUCCEEDED',error_code: null});
    expect(await sql('SELECT * FROM provider_runs')).toHaveLength(1);
  });
  it('survives transport acceptance before publisher acknowledgment without duplicating persistent effects', async () => {
    const {job} = await fixture(), transport = new Transport();
    class PublisherCrash extends PostgresJobStore { override markPublished() { return Promise.reject(new Error('synthetic publisher crash')); } }
    await expect(new JobService(new PublisherCrash(),transport,provider).dispatch()).rejects.toThrow('JOB_DISPATCH_UNAVAILABLE');
    await new JobService(new PostgresJobStore(),transport,provider).reconcile();
    expect(transport.jobs).toEqual([job,job]);
    for (const delivery of transport.jobs) await new JobService(new PostgresJobStore(),transport,provider).execute(delivery);
    expect(await sql('SELECT * FROM provider_runs')).toHaveLength(1);
  });
});
