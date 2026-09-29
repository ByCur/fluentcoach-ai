import { z } from 'zod';

const serverConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().url().refine((url) => url.startsWith('postgresql://'), 'must use postgresql://'),
  REDIS_URL: z.string().url().refine((url) => url.startsWith('redis://') || url.startsWith('rediss://'), 'must use redis:// or rediss://')
});

export type ServerConfig = z.infer<typeof serverConfigSchema>;

export class ConfigurationError extends Error {
  override name = 'ConfigurationError';
}

export function loadServerConfig(environment: NodeJS.ProcessEnv): ServerConfig {
  const result = serverConfigSchema.safeParse(environment);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => issue.path[0]).filter(Boolean))].join(', ');
    throw new ConfigurationError(`Invalid server configuration fields: ${fields}`);
  }
  return result.data;
}
