import { describe, expect, it } from 'vitest';
import { ConfigurationError, loadServerConfig } from './runtime-config.js';

const valid = { DATABASE_URL: 'postgresql://user:password@db:5432/app', REDIS_URL: 'redis://cache:6379' };

describe('server configuration', () => {
  it('parses valid values and defaults', () => {
    expect(loadServerConfig(valid)).toMatchObject({ NODE_ENV: 'development', API_PORT: 3000 });
  });

  it('rejects invalid configuration without echoing secrets', () => {
    const secret = 'do-not-print-this';
    expect(() => loadServerConfig({ ...valid, DATABASE_URL: secret })).toThrow(ConfigurationError);
    try { loadServerConfig({ ...valid, DATABASE_URL: secret }); } catch (error) {
      expect(String(error)).toContain('DATABASE_URL');
      expect(String(error)).not.toContain(secret);
      expect(String(error)).not.toContain(valid.REDIS_URL);
    }
  });

  it('rejects ports outside the TCP range', () => {
    expect(() => loadServerConfig({ ...valid, API_PORT: '70000' })).toThrow('API_PORT');
  });
});
