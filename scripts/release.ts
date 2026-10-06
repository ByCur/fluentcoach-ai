import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { validateReleaseRuntime, checkRelease, CLOUD_RELEASE_BLOCKERS, RELEASE_MIGRATION } from '../packages/infrastructure/src/release-policy.js';

async function main() {
  const [command, ...args] = process.argv.slice(2).filter(arg=>arg!=='--');
  if (command === 'preflight' && args.length === 0) {
    validateReleaseRuntime(process.env);
    if(!['ollama','fake'].includes(process.env['AI_PROVIDER'] ?? 'ollama') || !['whisper-cpp','fake'].includes(process.env['SPEECH_PROVIDER'] ?? 'whisper-cpp'))throw new Error('RELEASE_PROVIDERS_INVALID');
    for(const key of ['RENDER_PLAN','NEON_PLAN','REDIS_PLAN','QSTASH_PLAN','AUTH0_PLAN'])if(process.env[key] && process.env[key]!=='free')throw new Error('RELEASE_PLAN_INVALID');
    const workflow=await readFile('.github/workflows/ci.yml','utf8');
    const pkg = JSON.parse(await readFile('package.json', 'utf8')) as {scripts: Record<string, string>};
    for (const gate of ['test:migrations', 'release:preflight', 'test:deployment', 'test:release', 'test:e2e:cold-start', 'test:integration:privacy', 'test:security', 'test:a11y', 'drill:restore']) {
      if (!workflow.includes(`pnpm ${gate}`)) throw new Error('REQUIRED_CI_GATE_MISSING');
      if (!pkg.scripts[gate]) throw new Error('REQUIRED_GATE_MISSING');
    }
    const migrationNames = (await readdir('packages/infrastructure/prisma/migrations')).filter(n => /^2026/.test(n)).sort();
    if (migrationNames.at(-1) !== RELEASE_MIGRATION) throw new Error('RELEASE_MIGRATION_MISMATCH');
    const policy = JSON.parse(await readFile('infra/release-policy.json', 'utf8')) as Record<string, unknown>;
    if (policy['billingMode'] !== 'free_only' || policy['monthlyTargetEur'] !== 0 || policy['workerDeployed'] !== false || JSON.stringify(policy['blockers']) !== JSON.stringify(CLOUD_RELEASE_BLOCKERS)) throw new Error('RELEASE_POLICY_INVALID');
    const templates = await readdir('infra/environments');
    if (JSON.stringify(templates.sort()) !== JSON.stringify(['local.json','production.json','staging.json','test.json'])) throw new Error('ENVIRONMENT_TEMPLATE_MISSING');
    for (const name of templates) {
      const template = JSON.parse(await readFile(`infra/environments/${name}`, 'utf8')) as Record<string, string>;
      const expectedEnvironment=name.replace('.json','');
      if(template['APP_ENVIRONMENT']!==expectedEnvironment || template['NODE_ENV']!==(expectedEnvironment==='test'?'test':expectedEnvironment==='local'?'development':'production'))throw new Error('ENVIRONMENT_ISOLATION_INVALID');
      if (template['BILLING_MODE'] !== 'free_only' || template['AI_FALLBACK_PROVIDER'] !== 'none' || template['DEPLOY_WORKER'] !== 'false') throw new Error('ENVIRONMENT_POLICY_INVALID');
    }
    console.log(JSON.stringify({status: 'repository-preflight-passed', deployment: 'blocked', commitSha: execFileSync('git', ['rev-parse', 'HEAD'], {encoding:'utf8'}).trim(), blockers: CLOUD_RELEASE_BLOCKERS}));
    return;
  }
  if (command === 'check' && args[0] === '--manifest' && args[1] && (args.length === 2 || (args.length === 4 && args[2] === '--authorization' && args[3]))) {
    const manifest: unknown = JSON.parse(await readFile(args[1], 'utf8'));
    const authorization: unknown = args[3] ? JSON.parse(await readFile(args[3], 'utf8')) : undefined;
    checkRelease(manifest, authorization);
  }
  throw new Error('Usage: release:preflight OR release:check --manifest FILE [--authorization FILE]');
}
void main().catch(error => { console.error(error instanceof Error && /^(RELEASE_|EXPLICIT_|PROVIDER_|REQUIRED_|ENVIRONMENT_|Usage:)/.test(error.message) ? error.message : 'RELEASE_CHECK_FAILED'); process.exitCode = 1; });
