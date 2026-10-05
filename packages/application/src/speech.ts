import type { AiCallOptions } from './ai.js';

export const SPEECH_TRANSCRIPT_MAX_LENGTH = 8_000;

export interface SpeechTranscriptionInput {
  audio: Uint8Array;
  mimeType: string;
  filename: string;
  language: string;
}

export interface SpeechTranscriber {
  readonly provider: string;
  transcribe(
    input: SpeechTranscriptionInput,
    options: AiCallOptions,
  ): Promise<{ transcript: string; elapsedMs: number }>;
}
