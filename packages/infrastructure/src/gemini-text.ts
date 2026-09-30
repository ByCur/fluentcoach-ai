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
import { analysisPrompt, tutorPrompt } from './ai-prompts.js';
import type { AiBudget, FreeQuota } from './ai-budget.js';
const eventSchema = z.object({
  responseId: z.string().max(200).optional(),
  modelVersion: z.string().max(80).optional(),
  promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
  candidates: z
    .array(
      z.object({
        content: z
          .object({
            parts: z.array(
              z.object({
                text: z.string().optional(),
                thought: z.boolean().optional(),
              }),
            ),
          })
          .optional(),
        finishReason: z.string().optional(),
      }),
    )
    .max(1)
    .optional(),
  usageMetadata: z
    .object({
      promptTokenCount: z.number().int().nonnegative().optional(),
      candidatesTokenCount: z.number().int().nonnegative().optional(),
      totalTokenCount: z.number().int().nonnegative().optional(),
      thoughtsTokenCount: z.number().int().nonnegative().optional(),
    })
    .optional(),
});
export interface GeminiTextConfig {
  apiKey: string;
  model: string;
  billingMode: 'free_only';
  ownerApproved: true;
  syntheticOnly: true;
  quota: FreeQuota;
}
export class GeminiTextAdapter
  implements ConversationProvider, SessionAnalyzer
{
  readonly capabilities = {
    streaming: true,
    cancellation: true,
    structuredReports: true,
    usage: true,
  } as const;
  constructor(
    private readonly config: GeminiTextConfig,
    private readonly budget: AiBudget,
    private readonly request: typeof fetch = fetch,
  ) {
    if (
      config.billingMode !== 'free_only' ||
      config.ownerApproved !== true ||
      config.syntheticOnly !== true ||
      !/^gemini-[a-z0-9.-]+$/.test(config.model) ||
      !config.apiKey
    )
      throw new AiError('unauthorized');
    for (const n of [
      config.quota.dailyRequests,
      config.quota.dailyTokens,
      config.quota.maxInputTokens,
      config.quota.maxOutputTokens,
    ])
      if (!Number.isSafeInteger(n) || n <= 0)
        throw new AiError('budget-exhausted');
  }
  assertAvailable() {
    return this.budget.available();
  }
  async verifyCandidate(options: AiCallOptions) {
    if (options.signal?.aborted) throw new AiError('cancelled');
    if (
      !Number.isFinite(options.deadline.getTime()) ||
      options.deadline.getTime() <= Date.now()
    )
      throw new AiError('timeout');
    await this.budget.available();
    await this.budget.reserve(1);
    const controller = new AbortController();
    const cancel = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(
      () => controller.abort(new AiError('timeout')),
      Math.min(25000, options.deadline.getTime() - Date.now()),
    );
    try {
      if (options.signal?.aborted) throw new AiError('cancelled');
      if (options.deadline.getTime() <= Date.now())
        throw new AiError('timeout');
      const response = await beforeDeadline(
        this.request(
          `https://generativelanguage.googleapis.com/v1beta/models/${this.config.model}`,
          {
            headers: { 'x-goog-api-key': this.config.apiKey },
            signal: controller.signal,
          },
        ),
        { deadline: options.deadline, signal: controller.signal },
      );
      if (!response.ok) {
        if (response.status === 429) await this.budget.block();
        throw new AiError(
          response.status === 429
            ? 'rate-limited'
            : response.status === 401 || response.status === 403
              ? 'unauthorized'
              : 'unavailable',
        );
      }
      const text = await this.readBounded(response, controller, 16000, options);
      const model = z
        .object({
          name: z.string().max(100),
          version: z.string().max(80).optional(),
          inputTokenLimit: z.number().int().positive(),
          outputTokenLimit: z.number().int().positive(),
          supportedGenerationMethods: z.array(z.string().max(80)).max(30),
        })
        .safeParse(JSON.parse(text) as unknown);
      if (!model.success) throw new AiError('invalid-output');
      if (
        model.data.name !== `models/${this.config.model}` ||
        !model.data.supportedGenerationMethods.includes('generateContent')
      )
        throw new AiError('unsupported-capability');
      if (
        model.data.inputTokenLimit < this.config.quota.maxInputTokens ||
        model.data.outputTokenLimit < this.config.quota.maxOutputTokens
      )
        throw new AiError('budget-exhausted');
      return {
        ...model.data,
        freeTierLimitsAndTerms:
          'owner-attested-not-provided-by-model-api' as const,
      };
    } catch (error) {
      throw this.failure(error, controller, options);
    } finally {
      controller.abort();
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', cancel);
    }
  }

  private async begin(
    system: string,
    data: unknown,
    structured: boolean,
    options: AiCallOptions,
  ) {
    if (options.signal?.aborted) throw new AiError('cancelled');
    if (
      !Number.isFinite(options.deadline.getTime()) ||
      options.deadline.getTime() <= Date.now()
    )
      throw new AiError('timeout');
    const quota = this.config.quota;
    if (quota.verifiedUntil.getTime() <= Date.now())
      throw new AiError('budget-exhausted');
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: JSON.stringify(data) }] }],
      generationConfig: {
        maxOutputTokens: quota.maxOutputTokens,
        temperature: 0.2,
        ...(structured
          ? {
              responseMimeType: 'application/json',
              responseJsonSchema: REPORT_JSON_SCHEMA,
            }
          : {}),
      },
    });
    // UTF-8 byte length is a deliberately conservative input-token upper bound.
    if (Buffer.byteLength(body, 'utf8') > quota.maxInputTokens)
      throw new AiError('budget-exhausted');
    const reservation = await this.budget.reserve(
      Buffer.byteLength(body, 'utf8') + quota.maxOutputTokens,
    );
    const controller = new AbortController();
    const cancel = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(
      () => controller.abort(new AiError('timeout')),
      Math.min(25_000, options.deadline.getTime() - Date.now()),
    );
    const cleanup = () => {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', cancel);
    };
    const started = Date.now();
    try {
      if (options.signal?.aborted) throw new AiError('cancelled');
      if (options.deadline.getTime() <= Date.now())
        throw new AiError('timeout');
      const method = structured
        ? 'generateContent'
        : 'streamGenerateContent?alt=sse';
      const response = await beforeDeadline(
        this.request(
          `https://generativelanguage.googleapis.com/v1beta/models/${this.config.model}:${method}`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-goog-api-key': this.config.apiKey,
            },
            body,
            signal: controller.signal,
          },
        ),
        { deadline: options.deadline, signal: controller.signal },
      );
      if (!response.ok) {
        if (response.status === 429) {
          await this.budget.block();
          throw new AiError('rate-limited');
        }
        throw new AiError(
          response.status === 401 || response.status === 403
            ? 'unauthorized'
            : 'unavailable',
        );
      }
      return { response, reservation, started, controller, cleanup };
    } catch (error) {
      cleanup();
      const aborted = controller.signal.aborted;
      controller.abort();
      if (error instanceof AiError) throw error;
      throw new AiError(
        aborted
          ? options.signal?.aborted
            ? 'cancelled'
            : 'timeout'
          : 'unavailable',
      );
    }
  }
  private metadata(
    raw: z.infer<typeof eventSchema>,
    started: number,
    structured: boolean,
  ): ProviderMetadata {
    if (
      raw.promptFeedback?.blockReason ||
      raw.candidates?.[0]?.finishReason !== 'STOP'
    )
      throw new AiError('invalid-output');
    const input = raw.usageMetadata?.promptTokenCount ?? null;
    const usage = raw.usageMetadata;
    const output =
      usage?.totalTokenCount !== undefined && input !== null
        ? usage.totalTokenCount - input
        : usage?.candidatesTokenCount !== undefined
          ? usage.candidatesTokenCount + (usage.thoughtsTokenCount ?? 0)
          : null;
    if (output !== null && output < 0) throw new AiError('invalid-output');
    if (
      (input !== null && input > this.config.quota.maxInputTokens) ||
      (output !== null && output > this.config.quota.maxOutputTokens)
    )
      throw new AiError('budget-exhausted');
    return {
      adapter: 'gemini-free',
      model: raw.modelVersion ?? this.config.model,
      promptVersion: structured
        ? ANALYSIS_PROMPT_VERSION
        : TUTOR_PROMPT_VERSION,
      schemaVersion: structured ? REPORT_SCHEMA_VERSION : 'text-v1',
      ...(raw.responseId ? { requestId: raw.responseId } : {}),
      inputTokens: input,
      outputTokens: output,
      latencyMs: Date.now() - started,
      finishReason: 'STOP',
    };
  }
  private parse(raw: unknown) {
    const parsed = eventSchema.safeParse(raw);
    if (!parsed.success) throw new AiError('invalid-output');
    return parsed.data;
  }
  private text(raw: z.infer<typeof eventSchema>) {
    return (
      raw.candidates?.[0]?.content?.parts
        .filter((p) => !p.thought)
        .map((p) => p.text ?? '')
        .join('') ?? ''
    );
  }
  private failure(
    error: unknown,
    controller: AbortController,
    options: AiCallOptions,
  ): AiError {
    return error instanceof AiError
      ? error
      : new AiError(
          controller.signal.aborted
            ? options.signal?.aborted
              ? 'cancelled'
              : 'timeout'
            : 'invalid-output',
        );
  }
  async analyzeTranscript(
    transcript: AnalysisTranscript,
    options: AiCallOptions,
  ) {
    if (!transcript.synthetic) throw new AiError('unauthorized');
    const call = await this.begin(
      analysisPrompt(transcript),
      { snapshot: transcript.snapshot, turns: transcript.turns },
      true,
      options,
    );
    try {
      const text = await this.readBounded(
        call.response,
        call.controller,
        128_000,
        options,
      );
      const raw = this.parse(JSON.parse(text) as unknown),
        metadata = this.metadata(raw, call.started, true);
      await this.budget.settle(
        call.reservation,
        metadata.inputTokens,
        metadata.outputTokens,
      );
      return { draft: JSON.parse(this.text(raw)) as unknown, metadata };
    } catch (error) {
      if (error instanceof AiError && error.code === 'budget-exhausted')
        await this.budget.block();
      throw this.failure(error, call.controller, options);
    } finally {
      call.controller.abort();
      call.cleanup();
    }
  }
  private async readBounded(
    response: Response,
    controller: AbortController,
    max: number,
    options: AiCallOptions,
  ) {
    const reader = response.body?.getReader();
    if (!reader) throw new AiError('unavailable');
    let bytes = 0,
      result = '';
    const decoder = new TextDecoder();
    try {
      while (true) {
        const part = await beforeDeadline(reader.read(), {
          deadline: options.deadline,
          signal: controller.signal,
        });
        if (controller.signal.aborted) throw new AiError('timeout');
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > max) throw new AiError('invalid-output');
        result += decoder.decode(part.value, { stream: true });
      }
      return result + decoder.decode();
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
  }
  async *stream(
    context: TutorContext,
    input: string,
    options: AiCallOptions = { deadline: new Date(Date.now() + 25_000) },
  ) {
    if (!context.synthetic) throw new AiError('unauthorized');
    const call = await this.begin(
      tutorPrompt(context),
      { snapshot: context.snapshot, turns: context.recentTurns, input },
      false,
      options,
    );
    const reader = call.response.body?.getReader();
    if (!reader) {
      call.cleanup();
      throw new AiError('unavailable');
    }
    let buffer = '',
      bytes = 0,
      outputLength = 0,
      final: z.infer<typeof eventSchema> | undefined;
    const decoder = new TextDecoder();
    try {
      while (true) {
        const part = await beforeDeadline(reader.read(), {
          deadline: options.deadline,
          signal: call.controller.signal,
        });
        if (call.controller.signal.aborted) throw new AiError('timeout');
        buffer += part.done
          ? decoder.decode()
          : decoder.decode(part.value, { stream: true });
        if (!part.done) bytes += part.value.byteLength;
        if (bytes > 128_000) throw new AiError('invalid-output');
        let boundary: number;
        while ((boundary = buffer.search(/\r?\n\r?\n/)) >= 0) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + (buffer[boundary] === '\r' ? 4 : 2));
          const data = frame
            .split(/\r?\n/)
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trimStart())
            .join('\n');
          if (!data) continue;
          const raw = this.parse(JSON.parse(data) as unknown);
          if (final) {
            if (raw.candidates?.length || this.text(raw) || !raw.usageMetadata)
              throw new AiError('invalid-output');
            final = { ...final, usageMetadata: raw.usageMetadata };
            continue;
          }
          if (raw.promptFeedback?.blockReason)
            throw new AiError('invalid-output');
          const text = this.text(raw);
          outputLength += text.length;
          if (outputLength > 8000) throw new AiError('invalid-output');
          if (text) yield { text, done: false };
          if (raw.candidates?.[0]?.finishReason) final = raw;
        }
        if (part.done) break;
      }
      if (buffer.trim() || !final || !outputLength)
        throw new AiError('invalid-output');
      const metadata = this.metadata(final, call.started, false);
      await this.budget.settle(
        call.reservation,
        metadata.inputTokens,
        metadata.outputTokens,
      );
      yield { text: '', done: true, metadata };
    } catch (error) {
      if (error instanceof AiError && error.code === 'budget-exhausted')
        await this.budget.block();
      throw this.failure(error, call.controller, options);
    } finally {
      call.controller.abort();
      call.cleanup();
      await reader.cancel();
      reader.releaseLock();
    }
  }
}
