import { parseArgs } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { AiError, OLLAMA_ANALYSIS_PROMPT_VERSION, validateReport, type AnalysisTranscript } from '@fluentcoach/application';
import { loadAiConfig, OllamaTextAdapter } from '@fluentcoach/infrastructure';
import { PILOT_TEXT_CASES, PILOT_TEXT_SUITE_VERSION } from '../tests/evals/pilot-text.js';

async function main() {
  const {values} = parseArgs({args: process.argv.slice(2).filter(arg => arg !== '--'), options: {
    live: {type: 'boolean', default: false}, 'max-calls': {type: 'string', default: '4'},
    offset: {type: 'string', default: '0'}, output: {type: 'string', default: join(tmpdir(), 'fluentcoach-ollama-reports-v1.json')},
  }});
  const maxCalls = Number(values['max-calls']), offset = Number(values.offset);
  if (!values.live || !Number.isInteger(maxCalls) || maxCalls < 1 || maxCalls > 4
    || !Number.isInteger(offset) || offset < 0 || offset + maxCalls > 4)
    throw Error('Use --live --max-calls 1..4 [--offset 0..3]. Local synthetic reports only; at most 120 seconds per call.');
  if (process.env['BILLING_MODE'] && process.env['BILLING_MODE'] !== 'free_only') throw Error('Free-only evaluation required.');
  const config = loadAiConfig({...process.env, AI_PROVIDER: 'ollama', AI_FALLBACK_PROVIDER: 'none', OLLAMA_ANALYSIS_TIMEOUT_MS: '120000'});
  if (config.provider !== 'ollama') throw Error('Local Ollama required.');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(config.ollama.baseUrl).hostname)
    || config.ollama.model !== 'llama3.2:3b') throw Error('Local llama3.2:3b required.');
  const analyzer = new OllamaTextAdapter(config.ollama);
  const matrix = [['hotel','A1'], ['travel','A2'], ['free-conversation','B1'], ['past-experiences','B2']] as const;
  const results = [];
  for (const [scenario, level] of matrix.slice(offset, offset + maxCalls)) {
    const fixture = PILOT_TEXT_CASES.find(value => value.snapshot.scenarioSlug === scenario && value.snapshot.level === level && value.snapshot.mode === 'teaching')!;
    const transcript: AnalysisTranscript = {accountId: 'synthetic-evaluation', sessionId: fixture.id, revision: 1,
      snapshot: fixture.snapshot, partial: false, synthetic: true,
      turns: [{sequence: 1, sourceEventKey: fixture.id, speaker: 'learner', text: fixture.input, language: 'en'},
        {sequence: 2, sourceEventKey: 'tutor', speaker: 'tutor', text: 'Synthetic tutor context, never learner evidence.', language: 'en'},
        {sequence: 3, sourceEventKey: 'help', speaker: 'help', text: 'No entiendo.', language: 'es'}]};
    const start = Date.now();
    try {
      const result = await analyzer.analyzeTranscript(transcript, {deadline: new Date(Date.now() + 120000)});
      const report = validateReport(result.draft, transcript);
      results.push({caseId: fixture.id, status: 'passed', elapsedMs: Date.now() - start,
        findings: report.strengths.length + report.corrections.length, metadata: result.metadata});
    } catch (error) {
      results.push({caseId: fixture.id, status: 'failed', elapsedMs: Date.now() - start, code: error instanceof AiError ? error.code : 'evaluation-failed'});
    }
    console.log(JSON.stringify(results.at(-1)));
  }
  await writeFile(values.output, JSON.stringify({suite: 'ollama-reports-v1', fixtureVersion: PILOT_TEXT_SUITE_VERSION,
    promptVersion: OLLAMA_ANALYSIS_PROMPT_VERSION, syntheticOnly: true, billingMode: 'free_only', calls: results.length,
    maxCalls, perCallTimeoutMs: 120000, humanReviewed: false, results}, null, 2), {mode: 0o600});
  if (results.some(result => result.status !== 'passed')) process.exitCode = 1;
}
void main().catch(error => {console.error(error instanceof Error && error.message.startsWith('Use --live') ? error.message : 'OLLAMA_REPORT_EVAL_FAILED'); process.exitCode = 1;});
