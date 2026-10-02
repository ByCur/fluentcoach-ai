import { z } from 'zod';

const schema = z.object({
  SPEECH_PROVIDER: z.enum(['whisper-cpp', 'fake', 'disabled']).default('whisper-cpp'),
  WHISPER_BASE_URL: z.string().url().default('http://127.0.0.1:8080'),
  WHISPER_LANGUAGE: z.string().min(1).max(20).default('auto'),
  WHISPER_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(45_000),
});

export type SpeechConfig = {
  provider: 'whisper-cpp' | 'fake' | 'disabled';
  whisper: { baseUrl: string; language: string; timeoutMs: number };
};

export function loadSpeechConfig(environment: NodeJS.ProcessEnv): SpeechConfig {
  const value = schema.parse(environment);
  return {
    provider: value.SPEECH_PROVIDER,
    whisper: {
      baseUrl: value.WHISPER_BASE_URL.replace(/\/$/, ''),
      language: value.WHISPER_LANGUAGE,
      timeoutMs: value.WHISPER_TIMEOUT_MS,
    },
  };
}
