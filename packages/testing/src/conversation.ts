/* eslint-disable @typescript-eslint/require-await */
import { AiError, type AiCallOptions } from '@fluentcoach/application';
import type {
  ConversationProvider,
  SessionRecord,
  SessionRepository,
  TutorContext,
} from '@fluentcoach/application';
export class FakeConversationProvider implements ConversationProvider {
  constructor(private readonly delayMs = 0) {}
  async *stream(context: TutorContext, input: string, options?: AiCallOptions) {
    if (options?.signal?.aborted) throw new AiError('cancelled');
    if (options && options.deadline.getTime() <= Date.now())
      throw new AiError('timeout');
    if (context.helpLanguage === 'es') {
      yield {
        // Structural fake only; semantic grounding is reviewed with a live tutor.
        text: 'Explicación breve en español.\nTry simpler English.',
        done: true,
      };
      return;
    }

    const correction =
      context.snapshot.mode === 'teaching'
        ? ' Quick tip: use a complete sentence. For example: I would like a room. Would you like to try again?'
        : '';
    const parts = [
      "Let's continue: ",
      `${input}.`,
      correction || ' What would you like next?',
    ];
    for (let index = 0; index < parts.length; index++) {
      if (this.delayMs)
        await new Promise((resolve) => setTimeout(resolve, this.delayMs));
      if (options?.signal?.aborted) throw new AiError('cancelled');
      if (options && options.deadline.getTime() <= Date.now())
        throw new AiError('timeout');
      yield { text: parts[index]!, done: index === parts.length - 1 };
    }
  }
}
export class MemorySessionRepository implements SessionRepository {
  private rows = new Map<string, SessionRecord>();
  private next = 1;
  async create(accountId: string, snapshot: SessionRecord['snapshot']) {
    const row: SessionRecord = {
      id: `session-${this.next++}`,
      accountId,
      snapshot,
      state: 'created',
      turns: [],
      events: [],
    };
    this.rows.set(row.id, row);
    return structuredClone(row);
  }
  async get(accountId: string, id: string) {
    const x = this.rows.get(id);
    return x?.accountId === accountId ? structuredClone(x) : null;
  }
  async save(r: SessionRecord) {
    this.rows.set(r.id, structuredClone(r));
  }
  async history(a: string) {
    return [...this.rows.values()]
      .filter((x) => x.accountId === a)
      .map((x) => structuredClone(x));
  }
}
