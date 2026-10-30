import { execFileSync } from 'node:child_process';
import { log } from 'node:console';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'dist/FluentCoach-Windows.zip');
// Only these committed build inputs can enter a redistributable. Never glob
// the working directory: it may contain credentials, audio or learner exports.
const inputs = [
  'ABRIR.cmd', 'INSTALAR.cmd', 'CERRAR.cmd', 'LEEME.txt',
  '.dockerignore', '.npmrc', 'Dockerfile', 'package.json', 'pnpm-lock.yaml',
  'pnpm-workspace.yaml', 'tsconfig.base.json', 'apps', 'packages',
  'infra/nginx.conf', 'packaging/windows',
];
const tracked = execFileSync('git', ['ls-files', '-z', '--', ...inputs], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
if (tracked.some(path => /(^|\/)\.env($|\.)|\.(wav|webm|mp3|log|zip)$|(^|\/)(node_modules|dist)\//i.test(path))) {
  throw new Error('Private or generated files found in package inputs');
}
if (execFileSync('git', ['status', '--porcelain', '--untracked-files=no', '--', ...inputs], { cwd: root, encoding: 'utf8' }).trim()) {
  throw new Error('Commit package inputs before building a reviewable archive');
}
for (const file of inputs.filter(path => path.includes('.') && !['apps', 'packages', 'packaging/windows'].includes(path))) {
  if (!tracked.includes(file)) throw new Error(`Missing committed package input: ${file}`);
}
mkdirSync(dirname(output), { recursive: true });
execFileSync('git', ['archive', '--format=zip', '--prefix=FluentCoach/', `--output=${output}`, 'HEAD', '--', ...inputs], { cwd: root });
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const sha256 = createHash('sha256').update(readFileSync(output)).digest('hex');
writeFileSync(`${output}.sha256`, `${sha256}  FluentCoach-Windows.zip\n`);
writeFileSync(`${output}.json`, JSON.stringify({ commit, sha256, format: 'local-source-installer', status: 'device-and-pilot-validation-pending' }, null, 2) + '\n');
log(`Windows package: ${output}\nCommit: ${commit}\nSHA256: ${sha256}`);
