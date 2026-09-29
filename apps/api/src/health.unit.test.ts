import { describe, expect, it, vi } from 'vitest';
import { HealthController } from './health.controller.js';

describe('health controller', () => {
  it('keeps liveness independent from dependencies', () => {
    expect(new HealthController([]).live()).toEqual({ status: 'ok', service: 'api' });
  });

  it('returns 503 readiness without exposing dependency details', async () => {
    const status = vi.fn();
    const result = await new HealthController([() => Promise.resolve(false)]).ready({ status } as never);
    expect(status).toHaveBeenCalledWith(503);
    expect(result).toEqual({ status: 'not-ready', service: 'api' });
  });
});
