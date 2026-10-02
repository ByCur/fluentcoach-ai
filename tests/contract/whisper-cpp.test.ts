import { afterEach, describe, expect, it, vi } from 'vitest';
import { WhisperCppTranscriber } from '@fluentcoach/infrastructure';
import { AiError } from '@fluentcoach/application';

const input = {
  audio: new Uint8Array([1, 2, 3]),
  mimeType: 'audio/webm',
  filename: 'turn.webm',
  language: '',
};
const options = () => ({ deadline: new Date(Date.now() + 5_000) });
const adapter = (timeoutMs = 1_000) =>
  new WhisperCppTranscriber({
    baseUrl: 'http://127.0.0.1:8080',
    language: 'auto',
    timeoutMs,
  });

afterEach(() => vi.restoreAllMocks());

describe('WhisperCppTranscriber contract', () => {
  it('posts the official multipart inference shape and normalizes JSON', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ text: '  Hello there  ' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await expect(adapter().transcribe(input, options())).resolves.toMatchObject({
      transcript: 'Hello there',
    });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('http://127.0.0.1:8080/inference');
    expect(init?.method).toBe('POST');
    const form = init?.body as FormData;
    expect(form.get('response_format')).toBe('json');
    expect(form.get('language')).toBe('auto');
    expect((form.get('file') as File).type).toBe('audio/webm');
  });

  it.each([
    ['connection', () => Promise.reject(new TypeError('fetch failed')), 'unavailable'],
    ['http', () => Promise.resolve(new Response('', { status: 503 })), 'unavailable'],
    ['invalid json', () => Promise.resolve(new Response('nope')), 'invalid-output'],
    ['invalid shape', () => Promise.resolve(Response.json({ text: '' })), 'invalid-output'],
  ])('normalizes %s errors', async (_name, implementation, code) => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(implementation);
    await expect(adapter().transcribe(input, options())).rejects.toMatchObject({ code });
  });

  it('normalizes timeout and caller cancellation', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) =>
      new Promise((_resolve, reject) =>
        init?.signal?.addEventListener('abort', () =>
          reject(
            init.signal?.reason instanceof Error
              ? init.signal.reason
              : new Error('aborted'),
          ),
        ),
      ),
    );
    await expect(adapter(5).transcribe(input, options())).rejects.toMatchObject({ code: 'timeout' });
    const controller = new AbortController();
    controller.abort();
    await expect(
      adapter().transcribe(input, { ...options(), signal: controller.signal }),
    ).rejects.toBeInstanceOf(AiError);
  });

  it('applies the timeout while reading the response body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new ReadableStream({ start: () => undefined })),
    );
    await expect(adapter(5).transcribe(input, options())).rejects.toMatchObject({
      code: 'timeout',
    });
  });
});
