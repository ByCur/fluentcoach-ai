import { z } from 'zod';
import {
  AiError,
  beforeDeadline,
  ANALYSIS_PROMPT_VERSION,
  REPORT_JSON_SCHEMA,
  REPORT_SCHEMA_VERSION,
  TUTOR_PROMPT_VERSION,
  type AiCallOptions,
  type AnalysisTranscript,
  type ConversationProvider,
  type ProviderMetadata,
  type SessionAnalyzer,
  type TutorContext,
} from '@fluentcoach/application';
import { analysisPrompt, tutorInput, tutorPrompt } from './ai-prompts.js';

const responseSchema = z.object({
  model: z.string().min(1).max(200),
  message: z.object({
    role: z.literal('assistant'),
    content: z.string().max(128_000),
  }),
  done: z.literal(true),
  done_reason: z.string().max(100).optional(),
  prompt_eval_count: z.number().int().nonnegative().optional(),
  eval_count: z.number().int().nonnegative().optional(),
});

const tagsSchema = z.object({
  models: z.array(z.object({ name: z.string() })).max(10_000),
});

export interface OllamaTextConfig {
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
}

type NormalizedConfig = Required<OllamaTextConfig>;

export class OllamaTextAdapter
  implements ConversationProvider, SessionAnalyzer
{
  readonly capabilities = {
    streaming: false,
    cancellation: true,
    structuredReports: true,
    usage: true,
  } as const;
  private readonly config: NormalizedConfig;

  constructor(
    config: OllamaTextConfig = {},
    private readonly request: typeof fetch = fetch,
  ) {
    this.config = {
      baseUrl: config.baseUrl ?? 'http://127.0.0.1:11434',
      model: config.model ?? 'llama3.2:3b',
      timeoutMs: config.timeoutMs ?? 25_000,
    };
    if (
      !validBaseUrl(this.config.baseUrl) ||
      !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(this.config.model) ||
      !Number.isSafeInteger(this.config.timeoutMs) ||
      this.config.timeoutMs < 1_000 ||
      this.config.timeoutMs > 120_000
    )
      throw new AiError('unauthorized');
  }

  async assertAvailable(): Promise<void> {
    const options = { deadline: new Date(Date.now() + this.config.timeoutMs) };
    const response = await this.call('/api/tags', { method: 'GET' }, options);
    const raw = await this.json(response, options);
    const tags = tagsSchema.safeParse(raw);
    if (
      !tags.success ||
      !tags.data.models.some(
        ({ name }) =>
          name === this.config.model ||
          (!this.config.model.includes(':') &&
            name === `${this.config.model}:latest`),
      )
    )
      throw new AiError('unavailable');
  }

  private async generate(
    system: string,
    user: unknown,
    structured: boolean,
    options: AiCallOptions,
  ) {
    const started = Date.now();
    const response = await this.call(
      '/api/chat',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: this.config.model,
          stream: false,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: JSON.stringify(user) },
          ],
          options: { temperature: 0.2 },
          ...(structured ? { format: REPORT_JSON_SCHEMA } : {}),
        }),
      },
      options,
    );
    const parsed = responseSchema.safeParse(await this.json(response, options));
    if (!parsed.success || !parsed.data.message.content.trim())
      throw new AiError('invalid-output');
    const raw = parsed.data;
    const metadata: ProviderMetadata = {
      adapter: 'ollama',
      model: raw.model,
      promptVersion: structured
        ? ANALYSIS_PROMPT_VERSION
        : TUTOR_PROMPT_VERSION,
      schemaVersion: structured ? REPORT_SCHEMA_VERSION : 'text-v1',
      inputTokens: raw.prompt_eval_count ?? null,
      outputTokens: raw.eval_count ?? null,
      latencyMs: Date.now() - started,
      finishReason: raw.done_reason ?? 'stop',
    };
    return { text: raw.message.content, metadata };
  }

  async *stream(
    context: TutorContext,
    input: string,
    options: AiCallOptions = {
      deadline: new Date(Date.now() + this.config.timeoutMs),
    },
  ) {
    const result = await this.generate(
      tutorPrompt(context),
      tutorInput(context, input),
      false,
      options,
    );
    yield { text: result.text, done: false };
    yield { text: '', done: true, metadata: result.metadata };
  }

  async analyzeTranscript(
    transcript: AnalysisTranscript,
    options: AiCallOptions,
  ) {
    const result = await this.generate(
      analysisPrompt(transcript),
      { snapshot: transcript.snapshot, turns: transcript.turns },
      true,
      options,
    );
    try {
      return {
        draft: JSON.parse(result.text) as unknown,
        metadata: result.metadata,
      };
    } catch {
      throw new AiError('invalid-output');
    }
  }

  private async call(
    path: string,
    init: RequestInit,
    options: AiCallOptions,
  ): Promise<Response> {
    if (options.signal?.aborted) throw new AiError('cancelled');
    const remaining = Math.min(
      this.config.timeoutMs,
      options.deadline.getTime() - Date.now(),
    );
    if (!Number.isFinite(remaining) || remaining <= 0)
      throw new AiError('timeout');
    const controller = new AbortController();
    const cancel = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(
      () => controller.abort(new AiError('timeout')),
      remaining,
    );
    try {
      const response = await beforeDeadline(
        this.request(`${this.config.baseUrl}${path}`, {
          ...init,
          signal: controller.signal,
        }),
        { deadline: options.deadline, signal: controller.signal },
      );
      if (!response.ok)
        throw new AiError(
          response.status === 408 || response.status === 504
            ? 'timeout'
            : response.status === 429
              ? 'rate-limited'
              : 'unavailable',
        );
      return response;
    } catch (error) {
      if (error instanceof AiError) throw error;
      throw new AiError(
        controller.signal.aborted
          ? options.signal?.aborted
            ? 'cancelled'
            : 'timeout'
          : 'unavailable',
      );
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', cancel);
    }
  }

  private async json(response: Response, options: AiCallOptions) {
    const length = Number(response.headers.get('content-length'));
    if (Number.isFinite(length) && length > 128_000)
      throw new AiError('invalid-output');
    try {
      const text = await beforeDeadline(response.text(), options);
      if (Buffer.byteLength(text, 'utf8') > 128_000)
        throw new AiError('invalid-output');
      return JSON.parse(text) as unknown;
    } catch (error) {
      throw error instanceof AiError ? error : new AiError('invalid-output');
    }
  }
}

function validBaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      (url.pathname === '/' || url.pathname === '') &&
      value === value.replace(/\/$/, '')
    );
  } catch {
    return false;
  }
}
