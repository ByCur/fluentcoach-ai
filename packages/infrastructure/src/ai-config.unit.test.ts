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
  it('uses fake only outside production and keeps production disabled by default', () => {
    expect(loadAiConfig({})).toEqual({ provider: 'fake' });
    expect(loadAiConfig({ NODE_ENV: 'production' })).toEqual({
      provider: 'disabled',
    });
    expect(() =>
      loadAiConfig({ NODE_ENV: 'production', AI_PROVIDER: 'fake' }),
    ).toThrow('AI_PROVIDER');
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
