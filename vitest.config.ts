import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias: { '@fluentcoach/infrastructure': fileURLToPath(new URL('./packages/infrastructure/src/index.ts', import.meta.url)) } },
        test: { name: 'unit', include: ['packages/**/*.unit.test.ts', 'apps/**/*.unit.test.ts'] }
      },
      { test: { name: 'boundaries', include: ['tests/boundaries/**/*.test.ts'] } },
      { test: { name: 'smoke', include: ['tests/smoke/**/*.test.ts'] } }
    ]
  }
});
