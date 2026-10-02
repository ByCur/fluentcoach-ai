import { AiError, type SpeechTranscriber } from '@fluentcoach/application';
import {
  loadSpeechConfig,
  WhisperCppTranscriber,
} from '@fluentcoach/infrastructure';

export function speechTranscriber(): SpeechTranscriber {
  const config = loadSpeechConfig(process.env);
  if (config.provider === 'fake')
    return {
      provider: 'fake',
      transcribe: async () => ({ transcript: 'Synthetic spoken turn', elapsedMs: 0 }),
    };
  if (config.provider === 'disabled')
    return {
      provider: 'disabled',
      transcribe: () => Promise.reject(new AiError('unavailable')),
    };
  return new WhisperCppTranscriber(config.whisper);
}
