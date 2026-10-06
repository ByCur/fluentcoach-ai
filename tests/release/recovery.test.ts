import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createClient } from 'redis';
import { ConversationService, JobService } from '@fluentcoach/application';
import { PostgresSessionRepository, PostgresJobStore, PostgresPublicationBudget, QStashTransport, sql, pool } from '@fluentcoach/infrastructure';
import { FakeConversationProvider } from '@fluentcoach/testing';
import { RedisSessionStore, IDLE_MS, ABSOLUTE_MS } from '../../apps/api/src/session.js';
import { account, session, envelope, resetDatabase } from '../support/database.js';
beforeEach(async()=>{await resetDatabase();await sql('UPDATE release_control SET draining=false');await sql('TRUNCATE qstash_publication_budgets');});
afterEach(async()=>{vi.restoreAllMocks();await sql('UPDATE release_control SET draining=false');});
const provider={analyze:()=>Promise.resolve({providerRunId:randomUUID()})};
it('drain serializes with starts already admitted, denies new starts, and preserves completion of existing turns',async()=>{
  const a=await account('draining'), c=await pool.connect(), d=await pool.connect();
  try {
    await c.query('BEGIN');await c.query('SELECT * FROM release_control FOR SHARE');
    const pid=(await d.query<{pid:number}>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid;
    const drain=d.query('UPDATE release_control SET draining=true');
    let blocked=false;
    for(let attempt=0;attempt<100&&!blocked;attempt++){
      blocked=(await c.query<{blocked:boolean}>('SELECT cardinality(pg_blocking_pids($1))>0 AS blocked',[pid])).rows[0]!.blocked;
      if(!blocked)await new Promise(resolve=>setTimeout(resolve,10));
    }
    expect(blocked).toBe(true);
    await c.query('COMMIT');await drain;
    await expect(session(a.id,false)).rejects.toThrow('RELEASE_DRAINING');
  } finally {await c.query('ROLLBACK');c.release();d.release();}
  await sql('UPDATE release_control SET draining=false');
  const s=await session(a.id,false), conversations=new ConversationService(new PostgresSessionRepository(),new FakeConversationProvider());
  await sql('UPDATE release_control SET draining=true');
  const turn=await conversations.turn(a.id,s.id,randomUUID(),'Synthetic draining completion');
  expect(turn.turns).toHaveLength(2);
  await conversations.end(a.id,s.id);
  expect((await new PostgresSessionRepository().get(a.id,s.id))?.state).toBe('ended');
});
it('QStash quota response keeps canonical work pending through restart, then delayed duplicate delivery commits once',async()=>{
  const a=await account('qstash-release'), s=await session(a.id),store=new PostgresJobStore();
  const job=envelope((await store.finalize({accountId:a.id,sessionId:s.id,hasTurns:true})).run);
  const request=vi.fn<typeof fetch>().mockResolvedValue(new Response('',{status:429}));
  const transport=new QStashTransport({token:'synthetic-token',destination:'https://api.invalid/api/v1/jobs/analysis'},new PostgresPublicationBudget(),request);
  await expect(new JobService(store,transport,provider).dispatch()).rejects.toThrow('JOB_DISPATCH_UNAVAILABLE');
  await expect(new JobService(new PostgresJobStore(),transport,provider).dispatch()).rejects.toThrow('JOB_DISPATCH_UNAVAILABLE');
  expect(request).toHaveBeenCalledTimes(1);expect(await store.pending()).toEqual([job]);
  await sql('UPDATE qstash_publication_budgets SET blocked=false');request.mockResolvedValue(new Response('',{status:200}));
  const restarted=new JobService(new PostgresJobStore(),transport,provider);
  await restarted.reconcile();expect(await store.pending()).toEqual([]);
  // A published invocation can be delayed beyond our reconciliation threshold.
  await sql("UPDATE outbox_events SET published_at=now()-interval '31 seconds'");
  await restarted.reconcile();expect(request).toHaveBeenCalledTimes(3);
  expect((await Promise.all(Array.from({length:8},()=>new JobService(new PostgresJobStore(),transport,provider).execute(job)))).filter(r=>r==='succeeded')).toHaveLength(1);
  expect(await sql('SELECT 1 FROM provider_runs')).toHaveLength(1);expect(await store.pending()).toEqual([]);
});
it('concurrent publishers cannot exceed 100 daily reservations or retry through a blocked UTC day',async()=>{
  const budget=new PostgresPublicationBudget();
  const reservations=await Promise.all(Array.from({length:120},()=>budget.reserve()));
  expect(reservations.filter(Boolean)).toHaveLength(100);
  expect(await new PostgresPublicationBudget().reserve()).toBe(false);
  await sql('TRUNCATE qstash_publication_budgets');await budget.block();expect(await budget.reserve()).toBe(false);
  await sql("UPDATE qstash_publication_budgets SET day=day-1");expect(await budget.reserve()).toBe(true);
});
it('real Redis key loss revokes authentication without losing PostgreSQL history or pending analysis',async()=>{
  if(!process.env['REDIS_URL'])throw new Error('REDIS_URL required');
  const a=await account('redis-loss-release'),s=await session(a.id),store=new PostgresJobStore();
  const job=envelope((await store.finalize({accountId:a.id,sessionId:s.id,hasTurns:true})).run);
  // Dedicated Redis logical DB for synthetic tests; never a deployed isolation boundary.
  const url=new URL(process.env['REDIS_URL']);url.pathname='/14';
  const sessions=new RedisSessionStore(url.href),redis=createClient({url:url.href}),id=randomUUID(),now=Date.now();
  await redis.connect();
  try {
    await sessions.set(id,{accountId:a.id,csrf:'synthetic-csrf',authenticatedAt:now,lastSeenAt:now,absoluteExpiresAt:now+ABSOLUTE_MS});
    expect(await sessions.get(id)).toMatchObject({accountId:a.id});
    await redis.del(`session:${id}`);
    expect(await sessions.get(id)).toBeNull();expect(await store.pending()).toEqual([job]);
    expect(await new PostgresSessionRepository().get(a.id,s.id)).toMatchObject({turns:[{text:'A synthetic room request'}]});
    // Fresh login creates a new opaque token; deletion epochs still gate all learner access.
    await sessions.set(id,{accountId:a.id,csrf:'fresh-synthetic-csrf',authenticatedAt:now,lastSeenAt:now,absoluteExpiresAt:now+IDLE_MS});
  } finally {await redis.del(`session:${id}`);await redis.quit();await sessions.close();}
});
