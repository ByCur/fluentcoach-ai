import { describe, expect, it } from 'vitest';
import {
  ConversationService,
  type ConversationProvider,
  type SessionRecord,
  type SessionRepository,
} from './conversation.js';

const provider: ConversationProvider = {
  async *stream() {
    await Promise.resolve();
    yield { text: 'Synthetic response', done: true };
  },
};

function repository(
  state: SessionRecord['state'],
  stateAfterLeaseFailure = state,
): SessionRepository {
  let reads = 0;
  const record: SessionRecord = {
    id: 'session',
    accountId: 'account',
    snapshot: {
      scenarioSlug: 'hotel',
      scenarioVersion: 1,
      level: 'A2',
      mode: 'natural',
      promptVersion: 'tutor-v2',
    },
    state,
    turns: [],
    events: [],
  };
  return {
    create: () => Promise.resolve(record),
    get: () => {
      reads += 1;
      return Promise.resolve({
        ...structuredClone(record),
        state: reads > 1 ? stateAfterLeaseFailure : state,
      });
    },
    save: () => Promise.resolve(),
    history: () => Promise.resolve([]),
    acquireTurn: () => Promise.resolve(false),
    releaseTurn: () => Promise.resolve(),
  };
}

describe('conversation turn lease state semantics', () => {
  it.each(['ended', 'abandoned', 'failed'] as const)(
    'rejects a pre-existing %s session as terminal before lease acquisition',
    async (state) => {
      const service = new ConversationService(repository(state), provider);
      await expect(
        service.turn('account', 'session', 'turn', 'Hello'),
      ).rejects.toThrow('SESSION_TERMINAL');
    },
  );

  it('re-reads state and reports termination that races lease acquisition', async () => {
    const service = new ConversationService(
      repository('active', 'ended'),
      provider,
    );
    await expect(
      service.turn('account', 'session', 'turn', 'Hello'),
    ).rejects.toThrow('SESSION_TERMINAL');
  });

  it('keeps active lease contention as provider unavailability', async () => {
    const service = new ConversationService(repository('active'), provider);
    await expect(
      service.turn('account', 'session', 'turn', 'Hello'),
    ).rejects.toMatchObject({ code: 'unavailable' });
  });
});
