import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';

it('renders the desktop stack without inheriting host secrets, paid providers or public database ports', () => {
  const canary = 'SYNTHETIC_DESKTOP_HOST_SECRET_NEVER_SHIP';
  const rendered = execFileSync('docker', [
    'compose', '--project-name', 'fluentcoach-desktop',
    '--env-file', 'packaging/windows/desktop.env',
    '-f', 'packaging/windows/compose.yaml', 'config', '--format', 'json',
  ], {
    encoding: 'utf8',
    env: {
      ...process.env,
      DATABASE_URL: `postgresql://user:${canary}@remote.invalid/learner`,
      REDIS_URL: `redis://:${canary}@remote.invalid`,
      GEMINI_API_KEY: canary,
      AI_PROVIDER: 'gemini-free',
      BILLING_MODE: 'paid',
      PUBLIC_ORIGIN: 'https://remote.invalid',
      COMPOSE_FILE: 'missing-host-compose.yaml',
    },
  });
  expect(rendered).not.toContain(canary);
  expect(rendered).not.toContain('remote.invalid');
  const compose = JSON.parse(rendered) as {
    services: Record<string, {
      environment?: Record<string, string>;
      ports?: { host_ip: string; published: string }[];
      logging?: { driver: string };
      tmpfs?: string[];
    }>;
  };
  const { services } = compose;
  expect(services['api']?.environment).toMatchObject({
    AI_PROVIDER: 'ollama', AI_FALLBACK_PROVIDER: 'none', BILLING_MODE: 'free_only',
    SPEECH_PROVIDER: 'whisper-cpp', OLLAMA_BASE_URL: 'http://ollama:11434',
    WHISPER_BASE_URL: 'http://whisper:8080', PUBLIC_ORIGIN: 'http://localhost:17880',
  });
  expect(services['web']?.ports).toEqual([
    expect.objectContaining({ host_ip: '127.0.0.1', published: '17880' }),
  ]);
  for (const [name, service] of Object.entries(services)) {
    if (name !== 'web') expect(service.ports ?? []).toHaveLength(0);
    expect(service.logging?.driver).toBe('none');
  }
  expect(services['whisper']?.tmpfs).toContain('/tmp:size=128m,mode=1777');
  expect(services['worker']).toBeUndefined();
  expect(services['ollama']?.environment?.['OLLAMA_NO_CLOUD']).toBe('1');
});
