/* eslint-disable @typescript-eslint/require-await */
import { describe, expect, it } from 'vitest';
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
  async save(row: SessionRecord) { this.row = structuredClone(row); }
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
