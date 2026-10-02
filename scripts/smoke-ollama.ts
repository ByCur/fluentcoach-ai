import { performance } from 'node:perf_hooks';
import { OllamaTextAdapter } from '@fluentcoach/infrastructure';

async function main() {
  const provider = 'ollama';
  const model = process.env['OLLAMA_MODEL'] || 'llama3.2:3b';
  const adapter = new OllamaTextAdapter({
    baseUrl: process.env['OLLAMA_BASE_URL'] || 'http://127.0.0.1:11434',
    model,
  });
  const started = performance.now();
  let response = '';

  try {
    for await (const chunk of adapter.stream(
      {
        snapshot: {
          scenarioSlug: 'free-conversation',
          scenarioVersion: 1,
          level: 'A1',
          mode: 'natural',
          promptVersion: 'tutor-v2',
        },
        recentTurns: [],
      },
      'Correct this briefly: She go to school every day.',
    ))
      response += chunk.text;
    console.log(`provider: ${provider}`);
    console.log(`model: ${model}`);
    console.log('status/success: success');
    console.log(`response: ${response}`);
    console.log(`elapsed time: ${Math.round(performance.now() - started)} ms`);
  } catch (error) {
    console.log(`provider: ${provider}`);
    console.log(`model: ${model}`);
    console.log('status/success: failed');
    console.log(
      `response: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
    console.log(`elapsed time: ${Math.round(performance.now() - started)} ms`);
    process.exitCode = 1;
  }
}

void main();
