import { ConfigurationError } from './runtime-config.js';
import type { GeminiTextConfig } from './gemini-text.js';
import type { OllamaTextConfig } from './ollama-text.js';
export type AiRuntimeConfig =
  | { provider: 'fake' }
  | { provider: 'disabled' }
  | { provider: 'ollama'; ollama: Required<OllamaTextConfig> }
  | { provider: 'gemini-free'; gemini: GeminiTextConfig };
export function loadAiConfig(env: NodeJS.ProcessEnv): AiRuntimeConfig {
  const fail = (field: string): never => {
    throw new ConfigurationError(`Invalid AI configuration field: ${field}`);
  };
  if (env['BILLING_MODE'] && env['BILLING_MODE'] !== 'free_only')
    fail('BILLING_MODE');
  if (env['AI_FALLBACK_PROVIDER'] && env['AI_FALLBACK_PROVIDER'] !== 'none')
    fail('AI_FALLBACK_PROVIDER');
  const provider = env['AI_PROVIDER'] ?? 'ollama';
  if (provider === 'disabled') return { provider };
  if (provider === 'fake') {
    if (env['NODE_ENV'] === 'production') fail('AI_PROVIDER');
    return { provider };
  }
  if (provider === 'ollama') {
    const baseUrl = env['OLLAMA_BASE_URL'] || 'http://127.0.0.1:11434';
    try {
      const url = new URL(baseUrl);
      if (
        (url.protocol !== 'http:' && url.protocol !== 'https:') ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        (url.pathname !== '/' && url.pathname !== '') ||
        baseUrl.endsWith('/')
      )
        fail('OLLAMA_BASE_URL');
    } catch {
      fail('OLLAMA_BASE_URL');
    }
    const model = env['OLLAMA_MODEL'] || 'llama3.2:3b';
    if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(model))
      fail('OLLAMA_MODEL');
    const analysisTimeoutMs = Number(
      env['OLLAMA_ANALYSIS_TIMEOUT_MS'] ?? '90000',
    );
    if (
      !Number.isSafeInteger(analysisTimeoutMs) ||
      analysisTimeoutMs < 30_000 ||
      analysisTimeoutMs > 120_000
    )
      fail('OLLAMA_ANALYSIS_TIMEOUT_MS');
    return {
      provider,
      ollama: { baseUrl, model, timeoutMs: 25_000, analysisTimeoutMs },
    };
  }
  if (provider !== 'gemini-free') fail('AI_PROVIDER');
  if (env['AI_FREE_TIER_APPROVED'] !== 'true') fail('AI_FREE_TIER_APPROVED');
  if (env['AI_SYNTHETIC_ONLY'] !== 'true') fail('AI_SYNTHETIC_ONLY');
  if (!env['GEMINI_API_KEY']) fail('GEMINI_API_KEY');
  if (!env['GEMINI_MODEL'] || !/^gemini-[a-z0-9.-]+$/.test(env['GEMINI_MODEL']))
    fail('GEMINI_MODEL');
  if (!env['AI_FREE_TIER_REVIEW_ID']) fail('AI_FREE_TIER_REVIEW_ID');
  const verifiedUntil = new Date(env['AI_QUOTA_VERIFIED_UNTIL'] ?? '');
  if (
    !Number.isFinite(verifiedUntil.getTime()) ||
    verifiedUntil.getTime() <= Date.now()
  )
    fail('AI_QUOTA_VERIFIED_UNTIL');
  const positive = (field: string, max: number) => {
    const n = Number(env[field]);
    if (!Number.isSafeInteger(n) || n < 1 || n > max) fail(field);
    return n;
  };
  const quota = {
    verifiedUntil,
    dailyRequests: positive('AI_DAILY_REQUESTS', 100),
    dailyTokens: positive('AI_DAILY_TOKENS', 1_000_000),
    maxInputTokens: positive('AI_MAX_INPUT_TOKENS', 32_000),
    maxOutputTokens: positive('AI_MAX_OUTPUT_TOKENS', 4096),
  };
  if (quota.maxInputTokens + quota.maxOutputTokens > quota.dailyTokens)
    fail('AI_DAILY_TOKENS');
  return {
    provider: 'gemini-free',
    gemini: {
      apiKey: env['GEMINI_API_KEY']!,
      model: env['GEMINI_MODEL']!,
      billingMode: 'free_only',
      ownerApproved: true,
      syntheticOnly: true,
      quota,
    },
  };
}
