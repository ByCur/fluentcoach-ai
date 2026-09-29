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

  it('copies the built worker workspace into the worker runtime image', () => {
    const dockerfile = readFileSync('Dockerfile', 'utf8');
    const workerStage = dockerfile.slice(dockerfile.indexOf('FROM api AS worker'), dockerfile.indexOf('FROM nginx:'));
    expect(workerStage).toContain('COPY --from=build --chown=node:node /app/apps/worker ./apps/worker');
    expect(workerStage).toContain('CMD ["node", "apps/worker/dist/main.js"]');
  });
});
