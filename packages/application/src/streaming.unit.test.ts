/* eslint-disable @typescript-eslint/require-await */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConversationService, type ConversationProvider, type SessionRecord, type SessionRepository } from './conversation.js';

class Repository implements SessionRepository {
  row: SessionRecord | undefined;
  async create(accountId: string, snapshot: SessionRecord['snapshot']) {
    this.row = { id: 'session', accountId, snapshot, state: 'created', turns: [], events: [] };
    return structuredClone(this.row);
  }
  async get(accountId: string, id: string) {
    return this.row?.accountId === accountId && this.row.id === id ? structuredClone(this.row) : null;
  }
  async save(row: SessionRecord) { if(this.row?.state==='ended')throw new Error('SESSION_TERMINAL');this.row = structuredClone(row); }
  async history() { return this.row ? [structuredClone(this.row)] : []; }
}

class ControlledProvider implements ConversationProvider {
  release: (() => void) | undefined;
  async *stream() {
    yield { text: 'first ', done: false };
    await new Promise<void>((resolve) => { this.release = resolve; });
    yield { text: 'second', done: true };
  }
}

afterEach(()=>vi.useRealTimers());
describe('stream persistence', () => {
  it('persists deltas before the provider finishes so SSE can deliver them live', async () => {
    const repository = new Repository();
    const provider = new ControlledProvider();
    const service = new ConversationService(repository, provider);
    const session = await service.start('account', { scenarioSlug: 'hotel', level: 'A2', mode: 'natural' });
    const pending = service.turn('account', session.id, 'turn-1', 'Hello');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(repository.row?.events).toEqual([{ sequence: 1, kind: 'tutor.delta', payload: { text: 'first ', done: false } }]);
    provider.release?.();
    await expect(pending).resolves.toMatchObject({ turns: [{ speaker: 'learner' }, { speaker: 'tutor', text: 'first second' }] });
  });
});


describe('bounded finalization of in-flight text turns',()=>{
  it('deduplicates an in-flight retry and waits for completion before freezing the session',async()=>{
    const repository=new Repository(),provider=new ControlledProvider(),service=new ConversationService(repository,provider);
    const session=await service.start('account',{scenarioSlug:'hotel',level:'A2',mode:'natural'});
    const pending=service.turn('account',session.id,'one','Hello');
    expect(service.turn('account',session.id,'one','retried')).toBe(pending);
    await expect(service.turn('account',session.id,'two','Concurrent')).rejects.toThrow('SESSION_BUSY');
    await new Promise(resolve=>setTimeout(resolve,0));
    const ending=service.end('account',session.id);
    expect(repository.row?.state).toBe('active');
    provider.release?.();
    await pending;
    expect((await ending).turns.at(-1)?.text).toBe('first second');
    expect(repository.row?.state).toBe('ended');
  });
  it('ends within five seconds and rejects late provider writes without changing frozen evidence',async()=>{
    vi.useFakeTimers();
    const repository=new Repository(),provider=new ControlledProvider(),service=new ConversationService(repository,provider);
    const session=await service.start('account',{scenarioSlug:'hotel',level:'A1',mode:'natural'});
    const pending=service.turn('account',session.id,'one','Hello');
    await vi.advanceTimersByTimeAsync(0);
    const ending=service.end('account',session.id);
    await vi.advanceTimersByTimeAsync(4999);
    expect(repository.row?.state).toBe('active');
    await vi.advanceTimersByTimeAsync(1);
    await ending;
    const frozen=structuredClone(repository.row);
    const late=expect(pending).rejects.toThrow('SESSION_TERMINAL');
    provider.release?.();
    await late;
    expect(repository.row).toEqual(frozen);
  });
});
