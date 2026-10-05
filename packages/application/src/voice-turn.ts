import { AiError } from './ai.js';
import type { ConversationService, SessionRecord } from './conversation.js';
import type { SpeechTranscriber } from './speech.js';

export const VOICE_MAX_BYTES = 8 * 1024 * 1024;
export const VOICE_MAX_DURATION_MS = 30_000;
export const VOICE_MIME_TYPES = [
  'audio/webm',
  'audio/ogg',
  'audio/wav',
  'audio/x-wav',
  'audio/mp4',
  'audio/mpeg',
] as const;

export class VoiceTurnService {
  constructor(
    private readonly conversations: ConversationService,
    private readonly transcriber: SpeechTranscriber,
  ) {}

  async turn(input: {
    accountId: string;
    sessionId: string;
    sourceEventKey: string;
    audio: Uint8Array;
    mimeType: string;
    filename: string;
    durationMs: number;
    signal?: AbortSignal;
  }): Promise<SessionRecord> {
    await this.conversations.assertTurnAllowed(input.accountId, input.sessionId);
    if (!VOICE_MIME_TYPES.includes(input.mimeType as typeof VOICE_MIME_TYPES[number]))
      throw new Error('UNSUPPORTED_AUDIO_TYPE');
    if (!input.audio.byteLength || input.audio.byteLength > VOICE_MAX_BYTES)
      throw new Error('AUDIO_TOO_LARGE');
    if (
      !Number.isSafeInteger(input.durationMs) ||
      input.durationMs < 1 ||
      input.durationMs > VOICE_MAX_DURATION_MS
    ) throw new Error('AUDIO_DURATION_EXCEEDED');
    const deadline = new Date(Date.now() + 45_000);
    const result = await this.transcriber.transcribe(
      {
        audio: input.audio,
        mimeType: input.mimeType,
        filename: input.filename,
        language: '',
      },
      { deadline, ...(input.signal ? { signal: input.signal } : {}) },
    );
    if (input.signal?.aborted) throw new AiError('cancelled');
    return this.conversations.turn(
      input.accountId,
      input.sessionId,
      input.sourceEventKey,
      result.transcript,
      { kind: 'voice', durationMs: input.durationMs },
    );
  }
}
