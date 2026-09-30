import { beforeEach, describe, expect, it } from 'vitest';
import { PostgresJobStore, PostgresSessionRepository, sql } from '@fluentcoach/infrastructure';
import { account, envelope, resetDatabase, session } from '../support/database.js';
beforeEach(resetDatabase);
describe('M04 PostgreSQL transactions and revisions', () => {
  it('concurrent end commits exactly one terminal session, immutable snapshot, run and outbox', async () => {
    const a = await account('a'), s = await session(a.id), store = new PostgresJobStore();
    const results = await Promise.all(Array.from({length: 8}, () => store.finalize({accountId: a.id, sessionId: s.id, hasTurns: false})));
    expect(results.every(r => r.outboxId === results[0]!.outboxId)).toBe(true);
    expect(results[0]!.run.status).toBe('pending'); // persisted turns override a stale advisory flag
    expect(await sql('SELECT * FROM analysis_runs')).toHaveLength(1);
    expect(await sql('SELECT * FROM outbox_events')).toHaveLength(1);
    expect(await sql('SELECT * FROM transcript_revisions')).toHaveLength(1);
    expect((await sql('SELECT state,transcript_revision FROM practice_sessions'))[0]).toMatchObject({state: 'ENDED', transcript_revision: 1});
  });
  it('rolls back the session, snapshot and run when outbox insertion fails', async () => {
    const a = await account('a'), s = await session(a.id), store = new PostgresJobStore();
    await sql("ALTER TABLE outbox_events ADD CONSTRAINT synthetic_outbox_failure CHECK(event_type <> 'analysis.requested')");
    try { await expect(store.finalize({accountId: a.id, sessionId: s.id, hasTurns: true})).rejects.toMatchObject({code: '23514'}); }
    finally { await sql('ALTER TABLE outbox_events DROP CONSTRAINT synthetic_outbox_failure'); }
    expect((await sql('SELECT state,ended_at,transcript_revision FROM practice_sessions'))[0]).toMatchObject({state: 'ACTIVE', ended_at: null, transcript_revision: 0});
    for (const table of ['analysis_runs','outbox_events','transcript_revisions','transcript_revision_receipts']) expect(await sql(`SELECT * FROM ${table}`)).toHaveLength(0);
    expect((await store.finalize({accountId: a.id, sessionId: s.id, hasTurns: true})).run.status).toBe('pending');
  });
  it('creates one new analysis for genuinely new late evidence, deduplicates retries and leaves the terminal user session immutable', async () => {
    const a = await account('a'), s = await session(a.id), store = new PostgresJobStore();
    const first = await store.finalize({accountId: a.id, sessionId: s.id, hasTurns: true});
    const repo = new PostgresSessionRepository(), frozen = await repo.get(a.id, s.id);
    const endedAt = (await sql('SELECT ended_at FROM practice_sessions'))[0]!.ended_at;
    const turns = [...s.turns, {sequence: 2, sourceEventKey: 'late-server-event', speaker: 'learner' as const, text: 'New synthetic evidence', language: 'en' as const}];
    const input = {accountId: a.id, sessionId: s.id, sourceKey: 'late-revision-1', turns};
    const revisions = await Promise.all(Array.from({length: 6}, () => new PostgresJobStore().revise(input)));
    expect(revisions.every(r => r.run.id === revisions[0]!.run.id)).toBe(true);
    expect(revisions[0]!.run.revision).toBe(2);
    expect(await store.revise({...input, sourceKey: 'same-content'})).toEqual(revisions[0]);
    await expect(store.revise({...input,sourceKey:'same-content',turns:s.turns})).rejects.toThrow('REVISION_KEY_CONFLICT');
    await expect(store.revise({...input, turns: s.turns})).rejects.toThrow('REVISION_KEY_CONFLICT');
    expect(await repo.get(a.id, s.id)).toEqual(frozen);
    expect((await sql('SELECT ended_at FROM practice_sessions'))[0]!.ended_at).toEqual(endedAt);
    expect(await sql('SELECT * FROM analysis_runs')).toHaveLength(2);
    expect(await sql('SELECT * FROM outbox_events')).toHaveLength(2);
    const snapshots = await sql('SELECT revision,turns FROM transcript_revisions ORDER BY revision');
    expect(snapshots[0]).toMatchObject({revision: 1, turns: s.turns});
    expect(snapshots[1]).toMatchObject({revision: 2, turns});
    expect((await store.finalize({accountId: a.id, sessionId: s.id, hasTurns: true})).run.id).toBe(revisions[0]!.run.id);
    expect(first.run.id).not.toBe(revisions[0]!.run.id);
  });
  it('rolls back a failed new revision without advancing the current revision', async () => {
    const a = await account('a'), s = await session(a.id), store = new PostgresJobStore();
    await store.finalize({accountId: a.id, sessionId: s.id, hasTurns: true});
    await sql('ALTER TABLE outbox_events ADD CONSTRAINT synthetic_revision_failure CHECK((payload->>\'transcriptRevision\')::int < 2)');
    try { await expect(store.revise({accountId: a.id, sessionId: s.id, sourceKey: 'late', turns: [{...s.turns[0]!, text: 'New evidence'}]})).rejects.toMatchObject({code: '23514'}); }
    finally { await sql('ALTER TABLE outbox_events DROP CONSTRAINT synthetic_revision_failure'); }
    expect((await sql('SELECT transcript_revision FROM practice_sessions'))[0]!.transcript_revision).toBe(1);
    for (const table of ['analysis_runs','outbox_events','transcript_revisions','transcript_revision_receipts']) expect(await sql(`SELECT * FROM ${table}`)).toHaveLength(1);
  });
  it('skips empty sessions and preserves partial abandoned sessions explicitly', async () => {
    const a = await account('a'), empty = await session(a.id, false), partial = await session(a.id), store = new PostgresJobStore();
    const skipped = await store.finalize({accountId: a.id, sessionId: empty.id, hasTurns: true});
    expect(skipped.run.status).toBe('skipped');
    expect((await sql('SELECT published_at FROM outbox_events WHERE id=$1', [skipped.outboxId]))[0]!.published_at).not.toBeNull();
    await sql("UPDATE practice_sessions SET state='ABANDONED' WHERE id=$1", [partial.id]);
    const run = await store.finalize({accountId: a.id, sessionId: partial.id, hasTurns: true});
    expect(run.run.status).toBe('pending');
    expect((await sql('SELECT partial FROM transcript_revisions WHERE session_id=$1', [partial.id]))[0]!.partial).toBe(true);
    expect((await sql('SELECT state FROM practice_sessions WHERE id=$1', [partial.id]))[0]!.state).toBe('ABANDONED');
    expect(await store.pending()).toEqual([envelope(run.run)]);
  });
  it('blocks cross-account analysis/provider foreign keys, finalization, revision and job envelopes', async () => {
    const a = await account('a'), b = await account('b'), s = await session(a.id), store = new PostgresJobStore();
    await expect(store.finalize({accountId: b.id, sessionId: s.id, hasTurns: true})).rejects.toThrow('SESSION_NOT_FOUND');
    await expect(sql("INSERT INTO analysis_runs(session_id,account_id,transcript_revision,analyzer_version) VALUES($1,$2,1,'fake-v1')", [s.id,b.id])).rejects.toMatchObject({code: '23503'});
    const result = await store.finalize({accountId: a.id, sessionId: s.id, hasTurns: true}), job = envelope(result.run);
    await expect(sql("INSERT INTO provider_runs(account_id,analysis_run_id,operation,adapter,model,prompt_version,schema_version,outcome,latency_ms) VALUES($1,$2,'analysis','fake','fake','v1','v1','succeeded',0)", [b.id,result.run.id])).rejects.toMatchObject({code: '23503'});
    await expect(store.revise({accountId: b.id, sessionId: s.id, sourceKey: 'attack', turns: s.turns})).rejects.toThrow('SESSION_NOT_FOUND');
    for (const changed of [{accountId: b.id}, {sessionId: (await session(b.id)).id}, {transcriptRevision: 99}]) await expect(store.claim({...job,...changed}, new Date(), new Date(Date.now()+30000),3)).rejects.toThrow('JOB_ENVELOPE_MISMATCH');
    expect((await sql('SELECT attempts,status FROM analysis_runs'))[0]).toMatchObject({attempts: 0, status: 'PENDING'});
  });
});
