import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { performance } from 'node:perf_hooks';
import { WhisperCppTranscriber, loadSpeechConfig } from '@fluentcoach/infrastructure';

const filename = process.argv[2];
if (!filename) {
  console.error('Usage: pnpm smoke:whisper -- <local-audio-file>');
  process.exitCode = 2;
} else {
  const types: Record<string, string> = {
    '.webm': 'audio/webm', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.mp4': 'audio/mp4',
  };
  const mimeType = types[extname(filename).toLowerCase()];
  if (!mimeType) throw new Error('Unsupported audio extension');
  const config = loadSpeechConfig(process.env);
  if (config.provider !== 'whisper-cpp')
    throw new Error('SPEECH_PROVIDER must be whisper-cpp for the host smoke test');
  const started = performance.now();
  try {
    const result = await new WhisperCppTranscriber(config.whisper).transcribe(
      {
        audio: await readFile(filename),
        mimeType,
        filename: basename(filename),
        language: '',
      },
      { deadline: new Date(Date.now() + config.whisper.timeoutMs) },
    );
    console.log(`provider: whisper-cpp\nstatus: success\ntranscript: ${result.transcript}\nelapsed_ms: ${Math.round(performance.now() - started)}`);
  } catch (error) {
    console.log(`provider: whisper-cpp\nstatus: failed\ntranscript:\nelapsed_ms: ${Math.round(performance.now() - started)}`);
    throw error;
  }
}
