import {
  SCENARIOS,
  correctionPolicy,
  transitionSession,
  type ConversationMode,
  type ConversationTurn,
  type SessionSnapshot,
  type SessionState,
} from '@fluentcoach/domain';
import {
  AiError,
  beforeDeadline,
  TUTOR_PROMPT_VERSION,
  type AiCallOptions,
  type ProviderMetadata,
} from './ai.js';
export class TerminalSessionError extends AiError {
  override name = 'TerminalSessionError';
  constructor() {
    super('cancelled');
    this.message = 'SESSION_TERMINAL';
  }
}
const isTerminalSession = (state: SessionState) =>
  state === 'ended' || state === 'abandoned' || state === 'failed';
export interface TutorContext {
  snapshot: SessionSnapshot;
  recentTurns: readonly ConversationTurn[];
  helpLanguage?: 'es';
  accountId?: string;
  sessionId?: string;
  synthetic?: boolean;
}
export interface ConversationProvider {
  stream(
    context: TutorContext,
    input: string,
    options?: AiCallOptions,
  ): AsyncIterable<{
    text: string;
    done: boolean;
    metadata?: ProviderMetadata;
  }>;
  assertAvailable?(): Promise<void>;
}
export interface SessionRecord {
  id: string;
  accountId: string;
  snapshot: SessionSnapshot;
  state: SessionState;
  turns: ConversationTurn[];
  events: { sequence: number; kind: string; payload: unknown }[];
}
export interface SessionRepository {
  create(accountId: string, snapshot: SessionSnapshot): Promise<SessionRecord>;
  get(accountId: string, id: string): Promise<SessionRecord | null>;
  save(record: SessionRecord, leaseToken?: string): Promise<void>;
  history(accountId: string): Promise<SessionRecord[]>;
  acquireTurn?(
    accountId: string,
    sessionId: string,
    token: string,
  ): Promise<boolean>;
  releaseTurn?(
    accountId: string,
    sessionId: string,
    token: string,
  ): Promise<void>;
  recordProvider?(
    accountId: string,
    sessionId: string,
    metadata: ProviderMetadata,
  ): Promise<void>;
}
export interface SessionFinalizer {
  finalize(input: {
    accountId: string;
    sessionId: string;
    hasTurns: boolean;
  }): Promise<unknown>;
}
export class ConversationService {
  private inFlight = new Map<
    string,
    { key: string; result: Promise<SessionRecord> }
  >();
  private active = new Map<string, AbortController>();
  constructor(
    private repo: SessionRepository,
    private provider: ConversationProvider,
    private finalizer?: SessionFinalizer,
  ) {}
  scenarios() {
    return SCENARIOS;
  }
  async assertTurnAllowed(accountId: string, id: string) {
    const session = await this.required(accountId, id);
    if (!['created', 'active'].includes(session.state))
      throw new TerminalSessionError();
  }
  async start(
    accountId: string,
    input: {
      scenarioSlug: string;
      level: 'A1' | 'A2' | 'B1' | 'B2';
      mode: ConversationMode;
    },
  ) {
    await this.provider.assertAvailable?.();
    const scenario = SCENARIOS.find((x) => x.slug === input.scenarioSlug);
    if (!scenario) throw new Error('UNKNOWN_SCENARIO');
    return this.repo.create(accountId, {
      scenarioSlug: scenario.slug,
      scenarioVersion: scenario.version,
      level: input.level,
      mode: input.mode,
      promptVersion: TUTOR_PROMPT_VERSION,
    });
  }
  turn(accountId: string, id: string, key: string, text: string) {
    const scope = `${accountId}:${id}`,
      pending = this.inFlight.get(scope);
    if (pending)
      return pending.key === key
        ? pending.result
        : Promise.reject(new Error('SESSION_BUSY'));
    const result = this.generateTurn(accountId, id, key, text);
    this.inFlight.set(scope, { key, result });
    void result.then(
      () => this.inFlight.delete(scope),
      () => this.inFlight.delete(scope),
    );
    return result;
  }
  private async generateTurn(
    accountId: string,
    id: string,
    key: string,
    text: string,
  ) {
    const lockKey = `${accountId}:${id}`;
    if (this.active.has(lockKey)) throw new AiError('unavailable');
    const controller = new AbortController();
    const leaseToken = crypto.randomUUID();
    this.active.set(lockKey, controller);
    const deadline = new Date(Date.now() + 25_000);
    try {
      let s = await this.required(accountId, id);
      if (isTerminalSession(s.state)) throw new TerminalSessionError();
      if (this.repo.acquireTurn) {
        const acquired = await this.repo.acquireTurn(
          accountId,
          id,
          leaseToken,
        );
        if (!acquired) {
          s = await this.required(accountId, id);
          if (isTerminalSession(s.state)) throw new TerminalSessionError();
          throw new AiError('unavailable');
        }
      }
      s = await this.required(accountId, id);
      if (s.state === 'created') s.state = transitionSession(s.state, 'active');
      if (s.state !== 'active') throw new TerminalSessionError();
      const existing = s.turns.find((t) => t.sourceEventKey === key);
      if (s.turns.some((t) => t.sourceEventKey === `${key}:reply`)) return s;
      if (existing && existing.text !== text)
        throw Error('IDEMPOTENCY_CONFLICT');
      if (!existing) {
        s.turns.push({
          sequence: s.turns.length + 1,
          sourceEventKey: key,
          speaker: 'learner',
          text,
          language: 'en',
        });
        await this.repo.save(s, leaseToken);
      }
      let reply = '',
        done = false;
      const explicitHelp = /no entiendo|i don.t understand/i.test(text);
      try {
        const stream = this.provider.stream(
          {
            snapshot: s.snapshot,
            recentTurns: s.turns.slice(-40),
            accountId,
            sessionId: id,
            ...(explicitHelp ? { helpLanguage: 'es' as const } : {}),
          },
          text,
          { deadline, signal: controller.signal },
        );
        const iterator = stream[Symbol.asyncIterator]();
        while (true) {
          const next = await beforeDeadline(iterator.next(), {
            deadline,
            signal: controller.signal,
          });
          if (next.done) break;
          const chunk = next.value;
          if (chunk.metadata)
            await this.repo.recordProvider?.(accountId, id, chunk.metadata);
          if (controller.signal.aborted) throw new AiError('cancelled');
          if (done || reply.length + chunk.text.length > 8000)
            throw new AiError('invalid-output');
          reply += chunk.text;
          done = chunk.done;
          s.events.push({
            sequence: s.events.length + 1,
            kind: 'tutor.delta',
            payload: { text: chunk.text, done: chunk.done },
          });
          await this.repo.save(s, leaseToken);
        }
        if (controller.signal.aborted) throw new AiError('cancelled');
        if (!done || !reply.trim()) throw new AiError('invalid-output');
        s.turns.push({
          sequence: s.turns.length + 1,
          sourceEventKey: `${key}:reply`,
          speaker: 'tutor',
          text: reply,
          language: 'en',
        });
        s.events.push({
          sequence: s.events.length + 1,
          kind: 'turn.completed',
          payload: {
            through: s.turns.length,
            correction: correctionPolicy(s.snapshot.mode),
          },
        });
        await this.repo.save(s, leaseToken);
        return s;
      } catch (error) {
        if (
          ['ended', 'abandoned', 'failed'].includes(
            (await this.required(accountId, id)).state,
          )
        )
          throw new TerminalSessionError();
        const code = error instanceof AiError ? error.code : 'unavailable';
        s.events.push({
          sequence: s.events.length + 1,
          kind: 'provider.failed',
          payload: { code, sourceEventKey: key },
        });
        if ((await this.required(accountId, id)).state === 'active')
          await this.repo.save(s, leaseToken).catch(() => undefined);
        throw new AiError(code);
      }
    } finally {
      controller.abort();
      this.active.delete(lockKey);
      await this.repo.releaseTurn?.(accountId, id, leaseToken);
    }
  }
  async help(accountId: string, id: string) {
    let s = await this.required(accountId, id);
    if (s.state !== 'active') throw new Error('SESSION_NOT_ACTIVE');
    if (this.active.has(`${accountId}:${id}`)) throw new AiError('unavailable');
    const controller = new AbortController();
    const leaseToken = crypto.randomUUID();
    this.active.set(`${accountId}:${id}`, controller);
    const options = {
      deadline: new Date(Date.now() + 25_000),
      signal: controller.signal,
    };
    try {
      if (
        this.repo.acquireTurn &&
        !(await this.repo.acquireTurn(accountId, id, leaseToken))
      )
        throw new AiError('unavailable');
      s = await this.required(accountId, id);
      let text = '',
        done = false;
      const stream = this.provider.stream(
        {
          snapshot: s.snapshot,
          recentTurns: s.turns.slice(-40),
          accountId,
          sessionId: id,
          helpLanguage: 'es',
        },
        "I don't understand",
        options,
      );
      const iterator = stream[Symbol.asyncIterator]();
      while (true) {
        const next = await beforeDeadline(iterator.next(), options);
        if (next.done) break;
        if (done || text.length + next.value.text.length > 8000)
          throw new AiError('invalid-output');
        text += next.value.text;
        done = next.value.done;
        if (next.value.metadata)
          await this.repo.recordProvider?.(accountId, id, next.value.metadata);
      }
      if (!done || !text.trim()) throw new AiError('invalid-output');
      s.turns.push({
        sequence: s.turns.length + 1,
        sourceEventKey: `help:${s.turns.length}`,
        speaker: 'help',
        text,
        language: 'es',
      });
      await this.repo.save(s, leaseToken);
      return s;
    } finally {
      controller.abort();
      this.active.delete(`${accountId}:${id}`);
      await this.repo.releaseTurn?.(accountId, id, leaseToken);
    }
  }
  async end(accountId: string, id: string) {
    const pending = this.inFlight.get(`${accountId}:${id}`);
    if (pending) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          pending.result.catch(() => undefined),
          new Promise<void>((resolve) => {
            timer = setTimeout(resolve, 5000);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    }
    const s = await this.required(accountId, id);
    if (s.state === 'ended' && !this.finalizer) return s;
    s.state = transitionSession(s.state, 'ended');
    if (this.finalizer)
      await this.finalizer.finalize({
        accountId,
        sessionId: id,
        hasTurns: s.turns.some((t) => t.speaker === 'learner'),
      });
    else await this.repo.save(s);
    this.active.get(`${accountId}:${id}`)?.abort();
    return s;
  }
  events(accountId: string, id: string, cursor = 0) {
    return this.required(accountId, id).then((s) =>
      s.events.filter((e) => e.sequence > cursor),
    );
  }
  history(accountId: string) {
    return this.repo.history(accountId);
  }
  private async required(a: string, id: string) {
    const s = await this.repo.get(a, id);
    if (!s) throw new Error('SESSION_NOT_FOUND');
    return s;
  }
}
