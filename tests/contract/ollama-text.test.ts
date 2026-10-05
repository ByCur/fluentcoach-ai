import { describe, expect, it, vi } from 'vitest';
import { AiError, type AnalysisTranscript } from '@fluentcoach/application';
import { OllamaTextAdapter } from '@fluentcoach/infrastructure';

const context = {
  snapshot: {
    scenarioSlug: 'restaurant',
    scenarioVersion: 1,
    level: 'A1' as const,
    mode: 'natural' as const,
    promptVersion: 'tutor-v4',
  },
  recentTurns: [],
};
const options = () => ({ deadline: new Date(Date.now() + 5_000) });
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
const completion = (content = 'What would you like to order?') => ({
  model: 'llama3.2:3b',
  message: { role: 'assistant', content },
  done: true,
  done_reason: 'stop',
  prompt_eval_count: 42,
  eval_count: 8,
});

describe('Ollama normalized text adapter (network-free)', () => {
  it('uses local defaults, sends system and user messages, and normalizes text', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response(completion()));
    const chunks = [];
    for await (const chunk of new OllamaTextAdapter({}, request).stream(
      context,
      'I want soup.',
      options(),
    ))
      chunks.push(chunk);
    expect(request).toHaveBeenCalledOnce();
    const [url, init] = request.mock.calls[0]!;
    expect(url).toBe('http://127.0.0.1:11434/api/chat');
    expect(init?.headers).toEqual({ 'content-type': 'application/json' });
    expect(init).not.toHaveProperty('authorization');
    expect(typeof init?.body).toBe('string');
    const body = JSON.parse(init?.body as string) as {
      model: string;
      messages: { role: string; content: string }[];
    };
    expect(body.model).toBe('llama3.2:3b');
    expect(body.messages[0]).toMatchObject({ role: 'system' });
    expect(body.messages[0]!.content).toContain('English tutor');
    expect(body.messages[1]!.content).toContain('I want soup.');
    expect(chunks).toEqual([
      { text: 'What would you like to order?', done: false },
      {
        text: '',
        done: true,
        metadata: expect.objectContaining({
          adapter: 'ollama',
          model: 'llama3.2:3b',
          inputTokens: 42,
          outputTokens: 8,
          schemaVersion: 'text-v1',
        }),
      },
    ]);
  });

  it('requests schema-constrained JSON and returns a normalized report draft', async () => {
    const draft = {
      schemaVersion: 'report-v1',
      rubricVersion: 'pilot-text-v1',
      strengths: [],
      corrections: [],
    };
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response(completion(JSON.stringify(draft))));
    const transcript: AnalysisTranscript = {
      accountId: 'account',
      sessionId: 'session',
      revision: 1,
      snapshot: context.snapshot,
      turns: [],
      partial: false,
      synthetic: false,
    };
    const result = await new OllamaTextAdapter({}, request).analyzeTranscript(
      transcript,
      options(),
    );
    const requestBody = request.mock.calls[0]![1]?.body;
    expect(typeof requestBody).toBe('string');
    const body = JSON.parse(requestBody as string) as {
      format?: { type?: string };
    };
    expect(body.format?.type).toBe('object');
    expect(result.draft).toEqual(draft);
    expect(result.metadata.schemaVersion).toBe('report-v1');
  });

  it('checks model availability without sending credentials', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response({ models: [{ name: 'llama3.2:3b' }] }));
    await new OllamaTextAdapter({}, request).assertAvailable();
    expect(request.mock.calls[0]![0]).toBe('http://127.0.0.1:11434/api/tags');
    expect(request.mock.calls[0]![1]?.method).toBe('GET');
  });

  it.each([
    [
      'connection errors',
      vi.fn<typeof fetch>().mockRejectedValue(new TypeError('ECONNREFUSED')),
      'unavailable',
    ],
    [
      'missing models',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(response({ error: 'model not found' }, 404)),
      'unavailable',
    ],
    [
      'malformed output',
      vi.fn<typeof fetch>().mockResolvedValue(response({ done: true })),
      'invalid-output',
    ],
  ])('normalizes %s', async (_name, request, code) => {
    const pending = (async () => {
      for await (const chunk of new OllamaTextAdapter({}, request).stream(
        context,
        'Hello',
        options(),
      )) {
        void chunk;
      }
    })();
    await expect(pending).rejects.toMatchObject({ code });
  });

  it('normalizes cancellation and elapsed deadlines', async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const reason = init.signal?.reason;
            reject(reason instanceof Error ? reason : new Error('aborted'));
          });
        }),
    );
    const controller = new AbortController();
    const pending = (async () => {
      for await (const chunk of new OllamaTextAdapter({}, request).stream(
        context,
        'Hello',
        { deadline: new Date(Date.now() + 5_000), signal: controller.signal },
      )) {
        void chunk;
      }
    })();
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'cancelled' });
    await expect(
      new OllamaTextAdapter({}, request).analyzeTranscript(
        {
          accountId: 'account',
          sessionId: 'session',
          revision: 1,
          snapshot: context.snapshot,
          turns: [],
          partial: false,
          synthetic: false,
        },
        { deadline: new Date(0) },
      ),
    ).rejects.toEqual(new AiError('timeout'));
  });
});
