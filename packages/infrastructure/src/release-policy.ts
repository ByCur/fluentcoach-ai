import { z } from 'zod';
import { ConfigurationError } from './runtime-config.js';

export const RELEASE_MIGRATION = '202610070001_tutor_opening_progress';
export const PREVIOUS_MIGRATION = '202610060003_roadmap';
export const CLOUD_RELEASE_BLOCKERS = [
  'LOCAL_AI_VOICE_HOSTING_UNVERIFIED',
  'REDIS_FREE_ENCRYPTION_AT_REST_UNAVAILABLE',
  'INDEPENDENT_TOMBSTONE_STORAGE_UNVERIFIED',
] as const;
export type AppEnvironment = 'local' | 'test' | 'staging' | 'production';
export function appEnvironment(env: NodeJS.ProcessEnv): AppEnvironment {
  const value = env['APP_ENVIRONMENT'] ?? (env['NODE_ENV'] === 'test' ? 'test' : env['NODE_ENV'] === 'production' ? 'production' : 'local');
  if (!['local', 'test', 'staging', 'production'].includes(value)) throw new ConfigurationError('Invalid APP_ENVIRONMENT');
  if ((value === 'staging' || value === 'production') && env['NODE_ENV'] !== 'production') throw new ConfigurationError('Invalid NODE_ENV for deployed environment');
  if ((value === 'local' || value === 'test') && env['NODE_ENV'] === 'production') throw new ConfigurationError('Invalid APP_ENVIRONMENT for production runtime');
  if (value === 'test' && env['NODE_ENV'] !== 'test') throw new ConfigurationError('Invalid NODE_ENV for test environment');
  return value as AppEnvironment;
}
export const releaseIdentitySchema = z.object({
  commitSha: z.string().regex(/^[a-f0-9]{40}$/),
  imageDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  migrationVersion: z.literal(RELEASE_MIGRATION),
  compatibleMigrationVersions: z.tuple([z.literal(PREVIOUS_MIGRATION), z.literal(RELEASE_MIGRATION)]),
}).strict();
export type ReleaseIdentity = z.infer<typeof releaseIdentitySchema>;
export const releaseManifestSchema = z.object({
  version: z.literal('release-v1'),
  environment: z.enum(['staging', 'production']),
  identity: releaseIdentitySchema,
  topology: z.literal('render-free-local-ai-blocked'),
  billingMode: z.literal('free_only'),
  monthlyTargetEur: z.literal(0),
  workerDeployed: z.literal(false),
  paymentMethodAttached: z.literal(false),
  billingEnabled: z.literal(false),
  automaticUpgrade: z.literal(false),
  paidFallback: z.literal(false),
  services: z.object({render: z.literal('free'), neon: z.literal('free'), redis: z.literal('free'), qstash: z.literal('free'), auth0: z.literal('free')}).strict(),
  providerReviewDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // Separate canonical/Redis/identity/delivery boundaries must be evidenced, not just different URL strings.
  isolationReviewId: z.string().min(1),
}).strict();
export const operatorAuthorizationSchema = z.object({
  action: z.literal('production-deployment'),
  environment: z.literal('production'),
  operator: z.string().min(1).max(100),
  identity: releaseIdentitySchema,
  expiresAt: z.string().datetime(),
}).strict();
export function checkRelease(manifest: unknown, authorization?: unknown, now = new Date()): never {
  const parsed = releaseManifestSchema.safeParse(manifest);
  if (!parsed.success) throw new ConfigurationError('RELEASE_MANIFEST_INVALID');
  const review = new Date(parsed.data.providerReviewDate + 'T00:00:00Z').getTime();
  if (!Number.isFinite(review) || review > now.getTime() || now.getTime() - review > 7 * 86400000) throw new ConfigurationError('PROVIDER_REVIEW_EXPIRED');
  if (parsed.data.environment === 'production') {
    const approval = operatorAuthorizationSchema.safeParse(authorization);
    if (!approval.success || new Date(approval.data.expiresAt) <= now ||
      JSON.stringify(approval.data.identity) !== JSON.stringify(parsed.data.identity)) throw new ConfigurationError('EXPLICIT_OPERATOR_AUTHORIZATION_REQUIRED');
  }
  // No config/approval can override the current architectural and privacy blockers.
  throw new ConfigurationError(`RELEASE_BLOCKED: ${CLOUD_RELEASE_BLOCKERS.join(', ')}`);
}
export function validateReleaseRuntime(env: NodeJS.ProcessEnv): void {
  const environment = appEnvironment(env);
  if (env['BILLING_MODE'] !== undefined && env['BILLING_MODE'] !== 'free_only') throw new ConfigurationError('Invalid BILLING_MODE');
  if (env['AI_FALLBACK_PROVIDER'] !== undefined && env['AI_FALLBACK_PROVIDER'] !== 'none') throw new ConfigurationError('Invalid AI_FALLBACK_PROVIDER');
  if (env['DEPLOY_WORKER'] !== undefined && env['DEPLOY_WORKER'] !== 'false') throw new ConfigurationError('Invalid DEPLOY_WORKER');
  if (environment === 'staging' || environment === 'production') {
    if (env['BILLING_MODE'] !== 'free_only') throw new ConfigurationError('Explicit BILLING_MODE required');
    if ((env['AI_PROVIDER'] ?? 'ollama') !== 'ollama' || (env['SPEECH_PROVIDER'] ?? 'whisper-cpp') !== 'whisper-cpp') throw new ConfigurationError('Invalid deployed AI/voice providers');
    throw new ConfigurationError(`RELEASE_BLOCKED: ${CLOUD_RELEASE_BLOCKERS.join(', ')}`);
  }
  if (environment === 'test') {
    for (const key of ['DATABASE_URL', 'REDIS_URL'] as const) {
      try {
        const url = new URL(env[key] ?? '');
        if (!['localhost', '127.0.0.1', 'postgres', 'redis'].includes(url.hostname)) throw new Error();
        if (key === 'DATABASE_URL' && !url.pathname.endsWith('_test')) throw new Error();
      } catch { throw new ConfigurationError(`Invalid isolated test ${key}`); }
    }
  }
}
