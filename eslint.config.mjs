import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

const architectureRules = {
  'no-restricted-imports': ['error', {
    patterns: [{
      group: ['@nestjs/*', '@prisma/*', 'bullmq', 'ioredis', 'react', 'react-*', '@fluentcoach/infrastructure', '@fluentcoach/infrastructure/*'],
      message: 'Domain and application code must not depend on frameworks, ORM, queues, UI, or infrastructure.'
    }]
  }]
};

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', 'playwright.config.ts', 'scripts/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: { ...config.languageOptions, parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } }
  })),
  { files: ['packages/domain/**/*.{ts,tsx}', 'packages/application/**/*.{ts,tsx}'], rules: architectureRules },
  { files: ['**/*.test.ts'], rules: { '@typescript-eslint/no-unsafe-assignment': 'off', '@typescript-eslint/no-unsafe-member-access': 'off', '@typescript-eslint/no-unsafe-call': 'off' } },
  { files: ['apps/web/src/**/*.tsx'], rules: { '@typescript-eslint/no-unsafe-assignment': 'off', '@typescript-eslint/no-unsafe-member-access': 'off', '@typescript-eslint/no-unsafe-call': 'off', '@typescript-eslint/no-unsafe-return': 'off', '@typescript-eslint/no-unsafe-argument': 'off', '@typescript-eslint/no-misused-promises': 'off' } }
);
