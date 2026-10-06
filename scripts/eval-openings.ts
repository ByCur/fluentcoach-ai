import {writeFile} from 'node:fs/promises';
import {SCENARIOS} from '@fluentcoach/domain';
import {TUTOR_OPENING_PROMPT_VERSION, type ConversationProvider} from '@fluentcoach/application';
import {OllamaTextAdapter, loadAiConfig} from '@fluentcoach/infrastructure';
import {FakeConversationProvider} from '@fluentcoach/testing';

export async function evaluateOpenings(input: {live: boolean; maxCalls: number; output: string}) {
  if (!Number.isSafeInteger(input.maxCalls) || input.maxCalls < 1 || input.maxCalls > 6) throw Error('Opening live evaluation is capped at 1–6 local calls.');
  let provider: ConversationProvider = new FakeConversationProvider();
  if (input.live) {
    const config = loadAiConfig({...process.env, AI_PROVIDER: 'ollama', BILLING_MODE: 'free_only'});
    if (config.provider !== 'ollama') throw Error('Only local Ollama opening evaluation is allowed.');
    provider = new OllamaTextAdapter(config.ollama);
  }
  if (!provider.opening) throw Error('Opening provider required.');
  const cases = SCENARIOS.flatMap(scenario => (['A1','A2','B1','B2'] as const).map(level => ({scenario, level})));
  const selected = input.live ? cases.slice(0, input.maxCalls) : cases;
  const results = [];
  for (const {scenario, level} of selected) {
    const result = await provider.opening({snapshot: {scenarioSlug: scenario.slug, scenarioVersion: scenario.version, level, mode: 'natural', promptVersion: 'tutor-v4'}, recentTurns: [], activity: {title: `Conversación: ${scenario.title}`, type: 'conversation'}}, {deadline: new Date(Date.now() + 10_000)});
    const text = result.text.trim();
    const bounded = text.length <= 500 && text.split(/\s+/).length <= {A1: 30, A2: 40, B1: 50, B2: 60}[level]
      && (text.match(/[.!?]+(?=\s|$)/g)?.length ?? 0) <= 2 && !/certif|official assessment|CEFR score/i.test(text);
    results.push({scenario: scenario.slug, level, text, bounded});
  }
  await writeFile(input.output, JSON.stringify({suite: 'tutor-openings-v1', promptVersion: TUTOR_OPENING_PROMPT_VERSION, provider: input.live ? 'ollama' : 'fake', calls: selected.length, paidCalls: 0, semanticReview: input.live ? 'required' : 'not claimed', results}, null, 2));
  if (results.some(r => !r.bounded)) throw Error('Opening evaluation failed length/assessment bounds.');
  console.log(`Tutor opening bounds: ${results.length} cases passed; ${input.live ? 'local semantic review still required' : 'structural fake evaluation'}.`);
}
