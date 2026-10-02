import { describe, expect, it } from 'vitest';
import { loadSpeechConfig } from './speech-config.js';

describe('speech configuration', () => {
  it('defaults to the local whisper.cpp provider', () => {
    expect(loadSpeechConfig({}).provider).toBe('whisper-cpp');
    expect(loadSpeechConfig({}).whisper).toEqual({
      baseUrl: 'http://127.0.0.1:8080',
      language: 'auto',
      timeoutMs: 45_000,
    });
  });

  it.each(['test', 'development'] as const)(
    'allows fake only outside production (%s)',
    (NODE_ENV) => {
      expect(loadSpeechConfig({ NODE_ENV, SPEECH_PROVIDER: 'fake' }).provider)
        .toBe('fake');
    },
  );

  it('rejects fake in production', () => {
    expect(() =>
      loadSpeechConfig({ NODE_ENV: 'production', SPEECH_PROVIDER: 'fake' }),
    ).toThrow('Invalid speech configuration field: SPEECH_PROVIDER');
  });

  it('allows explicitly disabling speech in production', () => {
    expect(
      loadSpeechConfig({ NODE_ENV: 'production', SPEECH_PROVIDER: 'disabled' })
        .provider,
    ).toBe('disabled');
  });
});
