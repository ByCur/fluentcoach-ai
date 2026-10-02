import {
  AiError,
  SPEECH_TRANSCRIPT_MAX_LENGTH,
  beforeDeadline,
  type SpeechTranscriber,
  type SpeechTranscriptionInput,
  type AiCallOptions,
} from '@fluentcoach/application';

export interface WhisperCppConfig {
  baseUrl: string;
  language: string;
  timeoutMs: number;
}

export class WhisperCppTranscriber implements SpeechTranscriber {
  readonly provider = 'whisper-cpp';
  constructor(private readonly config: WhisperCppConfig) {}

  async transcribe(input: SpeechTranscriptionInput, options: AiCallOptions) {
    if (options.signal?.aborted) throw new AiError('cancelled');
    const started = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(new AiError('timeout')),
      Math.min(this.config.timeoutMs, Math.max(1, options.deadline.getTime() - Date.now())),
    );
    const cancel = () => controller.abort(new AiError('cancelled'));
    options.signal?.addEventListener('abort', cancel, { once: true });
    try {
      const form = new FormData();
      const bytes = new Uint8Array(input.audio.byteLength);
      bytes.set(input.audio);
      form.set('file', new Blob([bytes.buffer], { type: input.mimeType }), input.filename);
      form.set('response_format', 'json');
      form.set('language', input.language || this.config.language);
      const response = await beforeDeadline(
        fetch(`${this.config.baseUrl}/inference`, {
          method: 'POST',
          body: form,
          signal: controller.signal,
        }).catch((error: unknown) => {
          if (controller.signal.aborted)
            throw controller.signal.reason instanceof AiError
              ? controller.signal.reason
              : new AiError('cancelled');
          throw error;
        }),
        {
          deadline: options.deadline,
          ...(options.signal ? { signal: options.signal } : {}),
        },
      );
      if (!response.ok) throw new AiError('unavailable');
      const declaredLength = Number(response.headers.get('content-length') ?? 0);
      if (declaredLength > 64 * 1024) throw new AiError('invalid-output');
      let raw: unknown;
      try {
        const body = await response.text();
        if (body.length > 64 * 1024) throw new AiError('invalid-output');
        raw = JSON.parse(body);
      } catch (error) {
        if (error instanceof AiError) throw error;
        throw new AiError('invalid-output');
      }
      const transcript = (raw as { text?: unknown } | null)?.text;
      if (
        typeof transcript !== 'string' ||
        !transcript.trim() ||
        transcript.length > SPEECH_TRANSCRIPT_MAX_LENGTH
      ) throw new AiError('invalid-output');
      return { transcript: transcript.trim(), elapsedMs: Date.now() - started };
    } catch (error) {
      if (error instanceof AiError) throw error;
      throw new AiError('unavailable');
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', cancel);
      controller.abort();
    }
  }
}
