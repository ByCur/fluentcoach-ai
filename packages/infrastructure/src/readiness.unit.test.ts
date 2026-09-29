import { describe, expect, it } from 'vitest';
import { dependenciesReady } from './readiness.js';

describe('dependency readiness', () => {
  it('is ready only when every dependency is ready', async () => {
    await expect(dependenciesReady([() => Promise.resolve(true), () => Promise.resolve(true)])).resolves.toBe(true);
    await expect(dependenciesReady([() => Promise.resolve(true), () => Promise.resolve(false)])).resolves.toBe(false);
  });
});
