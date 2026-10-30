import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';

it('refuses implicit live evaluation and batches exceeding the four-call local report matrix', () => {
  for (const args of [[], ['--live', '--max-calls', '5'], ['--live', '--max-calls', '2', '--offset', '3']]) {
    expect(() => execFileSync('node', ['node_modules/tsx/dist/cli.mjs', 'scripts/eval-ollama-reports.ts', ...args], {
      stdio: 'pipe', timeout: 15000,
    })).toThrow(/Use --live --max-calls/);
  }
});
