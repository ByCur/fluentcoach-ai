import { afterEach, expect, it, vi } from 'vitest';
import {
  AiError,
  ReportService,
  type AnalysisTranscript,
  type ReportRepository,
} from './ai.js';
import {
  ConversationService,
  type ConversationProvider,
  type SessionRecord,
  type SessionRepository,
} from './conversation.js';
const snapshot = {
  scenarioSlug: 'hotel',
  scenarioVersion: 1,
  level: 'A1' as const,
  mode: 'natural' as const,
  promptVersion: 'tutor-v2',
};
function repository() {
  let session: SessionRecord = {
    id: 's',
    accountId: 'a',
    snapshot,
    state: 'active',
    turns: [],
    events: [],
  };
  return {
    create: () => Promise.resolve(structuredClone(session)),
    get: () => Promise.resolve(structuredClone(session)),
    save: (value: SessionRecord) => {
      session = structuredClone(value);
      return Promise.resolve();
    },
    history: () => Promise.resolve([structuredClone(session)]),
  } satisfies SessionRepository;
}
afterEach(() => vi.useRealTimers());
it('retains a failed learner turn and retries the same key without duplicate evidence', async () => {
  const repo = repository();
  let fail = true;
  const provider: ConversationProvider = {
    async *stream() {
      await Promise.resolve();
      if (fail) {
        fail = false;
        throw new AiError('rate-limited');
      }
      yield { text: 'Would you like a room?', done: true };
    },
  };
  const service = new ConversationService(repo, provider);
  await expect(
    service.turn('a', 's', 'same-key', 'I need room'),
  ).rejects.toThrow('rate-limited');
  expect((await repo.get()).turns).toHaveLength(1);
  const completed = await service.turn('a', 's', 'same-key', 'I need room');
  expect(
    completed.turns.filter((turn) => turn.speaker === 'learner'),
  ).toHaveLength(1);
  expect(
    completed.turns.filter((turn) => turn.speaker === 'tutor'),
  ).toHaveLength(1);
  await service.turn('a', 's', 'same-key', 'I need room');
  expect((await repo.get()).turns).toHaveLength(2);
});
it('bounds stalled streamed output, persists a failure event and excludes partial tutor output from evidence', async () => {
  vi.useFakeTimers();
  const repo = repository(),
    provider: ConversationProvider = {
      async *stream() {
        yield { text: 'partial', done: false };
        await new Promise(() => undefined);
      },
    };
  const service = new ConversationService(repo, provider),
    pending = service.turn('a', 's', 'turn', 'Hello'),
    assertion = expect(pending).rejects.toThrow('timeout');
  await vi.advanceTimersByTimeAsync(25001);
  await assertion;
  const session = await repo.get();
  expect(session.turns.map((turn) => turn.speaker)).toEqual(['learner']);
  expect(session.events.at(-1)).toMatchObject({
    kind: 'provider.failed',
    payload: { code: 'timeout' },
  });
});
it('bounds an analyzer that ignores cancellation and rejects its late result', async () => {
  vi.useFakeTimers();
  const transcript: AnalysisTranscript = {
    accountId: 'a',
    sessionId: 's',
    revision: 1,
    snapshot,
    turns: [],
    partial: false,
    synthetic: true,
  };
  const repo: ReportRepository = {
    transcript: () => Promise.resolve(transcript),
    view: () =>
      Promise.resolve({ status: 'pending', revision: 1, partial: false }),
    retry: () => Promise.resolve(),
  };
  const analyzer = {
    analyzeTranscript: vi.fn(
      () => new Promise<{ draft: unknown; metadata: never }>(() => undefined),
    ),
  };
  const reports = new ReportService(repo, analyzer),
    pending = reports.analyze({
      analysisRunId: 'r',
      accountId: 'a',
      sessionId: 's',
      transcriptRevision: 1,
    }),
    assertion = expect(pending).rejects.toThrow('timeout');
  await vi.advanceTimersByTimeAsync(25001);
  await assertion;
  expect(analyzer.analyzeTranscript).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
