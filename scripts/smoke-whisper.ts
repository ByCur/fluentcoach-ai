import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  WhisperCppTranscriber,
  loadSpeechConfig,
} from '@fluentcoach/infrastructure';

async function main() {
  const provider = 'whisper-cpp';
  const filename = process.argv[2];
  const started = performance.now();
  try {
    if (!filename)
      throw new Error('Usage: pnpm smoke:whisper -- <local-audio-file>');
    const types: Record<string, string> = {
      '.webm': 'audio/webm',
      '.ogg': 'audio/ogg',
      '.wav': 'audio/wav',
      '.mp3': 'audio/mpeg',
      '.m4a': 'audio/mp4',
      '.mp4': 'audio/mp4',
    };
    const mimeType = types[extname(filename).toLowerCase()];
    if (!mimeType) throw new Error('Unsupported audio extension');
    const config = loadSpeechConfig(process.env);
    if (config.provider !== provider)
      throw new Error('SPEECH_PROVIDER must be whisper-cpp for the host smoke test');
    const result = await new WhisperCppTranscriber(config.whisper).transcribe(
      {
        audio: await readFile(filename),
        mimeType,
        filename: basename(filename),
        language: '',
      },
      { deadline: new Date(Date.now() + config.whisper.timeoutMs) },
    );
    console.log(`provider: ${provider}`);
    console.log('status/success: success');
    console.log(`transcript: ${result.transcript}`);
    console.log(`elapsed time: ${Math.round(performance.now() - started)} ms`);
  } catch (error) {
    console.log(`provider: ${provider}`);
    console.log('status/success: failed');
    console.log(
      `transcript: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
    console.log(`elapsed time: ${Math.round(performance.now() - started)} ms`);
    process.exitCode = 1;
  }
}

void main();
