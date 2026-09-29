import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const forbidden = /from\s+['"](?:@nestjs\/|@prisma\/|bullmq|ioredis|react(?:-|['"]|\/)|@fluentcoach\/infrastructure)/;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : ['.ts', '.tsx'].includes(extname(path)) ? [path] : [];
  });
}

describe('architecture boundaries', () => {
  it.each(['packages/domain/src', 'packages/application/src'])('%s has no framework or infrastructure imports', (directory) => {
    const violations = sourceFiles(directory).filter((file) => forbidden.test(readFileSync(file, 'utf8')));
    expect(violations).toEqual([]);
  });
});
