import { describe, expect, it } from 'vitest';
import { loadAiConfig } from './ai-config.js';
const approved = {
  BILLING_MODE: 'free_only',
  AI_PROVIDER: 'gemini-free',
  AI_FREE_TIER_APPROVED: 'true',
  AI_SYNTHETIC_ONLY: 'true',
  AI_FREE_TIER_REVIEW_ID: 'synthetic-test-attestation',
  GEMINI_API_KEY: 'synthetic-secret',
  GEMINI_MODEL: 'gemini-3.8-flash',
  AI_QUOTA_VERIFIED_UNTIL: '2099-01-01T00:00:00Z',
  AI_DAILY_REQUESTS: '6',
  AI_DAILY_TOKENS: '100000',
  AI_MAX_INPUT_TOKENS: '16000',
  AI_MAX_OUTPUT_TOKENS: '1000',
};
describe('free-only AI startup', () => {
  it('defaults to local Ollama in every environment', () => {
    expect(loadAiConfig({})).toEqual({
      provider: 'ollama',
      ollama: {
        baseUrl: 'http://127.0.0.1:11434',
        model: 'llama3.2:3b',
        timeoutMs: 25_000,
        analysisTimeoutMs: 90_000,
      },
    });
    expect(loadAiConfig({ NODE_ENV: 'production' }).provider).toBe('ollama');
    expect(() =>
      loadAiConfig({ NODE_ENV: 'production', AI_PROVIDER: 'fake' }),
    ).toThrow('AI_PROVIDER');
  });
  it('accepts explicit Ollama settings and rejects unsafe values', () => {
    expect(
      loadAiConfig({
        AI_PROVIDER: 'ollama',
        OLLAMA_BASE_URL: 'http://localhost:11434',
        OLLAMA_MODEL: 'llama3.2:3b',
      }),
    ).toMatchObject({ provider: 'ollama' });
    for (const delta of [
      { OLLAMA_BASE_URL: 'ftp://localhost:11434' },
      { OLLAMA_BASE_URL: 'http://user:secret@localhost:11434' },
      { OLLAMA_BASE_URL: 'http://localhost:11434/api' },
      { OLLAMA_MODEL: 'bad model' },
    ])
      expect(() => loadAiConfig({ AI_PROVIDER: 'ollama', ...delta })).toThrow();
  });
  it.each(['30000', '90000', '120000'])('accepts bounded report analysis timeout %s without changing turns', (value) => {
    expect(loadAiConfig({ OLLAMA_ANALYSIS_TIMEOUT_MS: value })).toMatchObject({
      ollama: { timeoutMs: 25_000, analysisTimeoutMs: Number(value) },
    });
  });
  it.each(['', '29999', '120001', '90000.5', 'NaN', 'Infinity', 'bad'])('rejects invalid report analysis timeout %s', (value) => {
    expect(() => loadAiConfig({ OLLAMA_ANALYSIS_TIMEOUT_MS: value })).toThrow('OLLAMA_ANALYSIS_TIMEOUT_MS');
  });
  it('requires explicit owner approval and verified quota for Gemini', () => {
    expect(loadAiConfig(approved).provider).toBe('gemini-free');
    for (const field of [
      'AI_FREE_TIER_APPROVED',
      'AI_SYNTHETIC_ONLY',
      'AI_FREE_TIER_REVIEW_ID',
      'GEMINI_API_KEY',
      'GEMINI_MODEL',
      'AI_QUOTA_VERIFIED_UNTIL',
      'AI_DAILY_REQUESTS',
      'AI_DAILY_TOKENS',
      'AI_MAX_INPUT_TOKENS',
      'AI_MAX_OUTPUT_TOKENS',
    ])
      expect(() => loadAiConfig({ ...approved, [field]: '' })).toThrow(field);
  });
  it('rejects paid providers, fallback, expired quota and unbounded values without exposing secrets', () => {
    for (const delta of [
      { AI_PROVIDER: 'openai' },
      { AI_FALLBACK_PROVIDER: 'openai' },
      { BILLING_MODE: 'paid' },
      { AI_QUOTA_VERIFIED_UNTIL: '2000-01-01' },
      { AI_DAILY_REQUESTS: '101' },
      { AI_DAILY_TOKENS: '100' },
      { AI_MAX_INPUT_TOKENS: 'Infinity' },
    ]) {
      expect(() => loadAiConfig({ ...approved, ...delta })).toThrow();
      try {
        loadAiConfig({ ...approved, ...delta });
      } catch (error) {
        expect(String(error)).not.toContain('synthetic-secret');
      }
    }
  });
});
