import { accessSync, constants, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('container smoke contract', () => {
  it('defines each M01 process and dependency with a health check', () => {
    const compose = readFileSync('compose.yaml', 'utf8');
    for (const service of ['postgres:', 'redis:', 'api:', 'worker:', 'web:']) expect(compose).toContain(service);
    expect(compose.match(/healthcheck:/g)).toHaveLength(5);
  });

  it('provides build inputs and does not bake a local environment file into images', () => {
    for (const file of ['Dockerfile', 'infra/nginx.conf', '.dockerignore', '.env.example']) accessSync(file, constants.R_OK);
    expect(readFileSync('.dockerignore', 'utf8')).toContain('.env');
  });
});
