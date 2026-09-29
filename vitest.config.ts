import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const sourceAliases = {
  '@fluentcoach/application': fileURLToPath(new URL('./packages/application/src/index.ts', import.meta.url)),
  '@fluentcoach/contracts': fileURLToPath(new URL('./packages/contracts/src/index.ts', import.meta.url)),
  '@fluentcoach/domain': fileURLToPath(new URL('./packages/domain/src/index.ts', import.meta.url)),
  '@fluentcoach/infrastructure': fileURLToPath(new URL('./packages/infrastructure/src/index.ts', import.meta.url)),
  '@fluentcoach/testing': fileURLToPath(new URL('./packages/testing/src/index.ts', import.meta.url))
};

export default defineConfig({
  test: {
    fileParallelism: false,
    projects: [
      { resolve: { alias: sourceAliases }, test: { name: 'unit', include: ['packages/**/*.unit.test.ts', 'apps/**/*.unit.test.ts'] } },
      { resolve: { alias: sourceAliases }, test: { name: 'boundaries', include: ['tests/boundaries/**/*.test.ts'] } },
      { resolve: { alias: sourceAliases }, test: { name: 'smoke', include: ['tests/smoke/**/*.test.ts'] } },
      { resolve: { alias: sourceAliases }, test: { name: 'identity', include: ['tests/integration/**/*.test.ts'], testTimeout: 15000 } }
    ]
  }
});
