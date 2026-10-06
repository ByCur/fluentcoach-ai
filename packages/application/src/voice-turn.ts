import { OPERATIONAL_LIMITS } from '@fluentcoach/domain';
import type { Telemetry } from './telemetry.js';
import { AiError } from './ai.js';
import type { ConversationService, SessionRecord } from './conversation.js';
import type { SpeechTranscriber } from './speech.js';

export const VOICE_MAX_BYTES = OPERATIONAL_LIMITS.audioBytes;
export const VOICE_MAX_DURATION_MS = OPERATIONAL_LIMITS.audioDurationMs;
export const VOICE_MIME_TYPES = OPERATIONAL_LIMITS.audioMimeTypes;

export class VoiceTurnService {
  constructor(
    private readonly conversations: ConversationService,
    private readonly transcriber: SpeechTranscriber,
    private readonly telemetry:Telemetry={record:()=>undefined},
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
    const started=Date.now();
    const result = await this.transcriber.transcribe(
      {
        audio: input.audio,
        mimeType: input.mimeType,
        filename: input.filename,
        language: '',
      },
      { deadline, ...(input.signal ? { signal: input.signal } : {}) },
    ).catch((error:unknown)=>{this.telemetry.record({operation:'speech',outcome:'failure',durationMs:Date.now()-started,count:1});throw error;});
    this.telemetry.record({operation:'speech',outcome:'success',durationMs:Date.now()-started,count:1});
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
