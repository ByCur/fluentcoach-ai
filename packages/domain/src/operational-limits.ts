/** Versioned pilot caps, shared by server transports and application validation. */
export const OPERATIONAL_LIMITS_VERSION = "operational-limits-v1" as const;
export const OPERATIONAL_LIMITS = Object.freeze({
  textTurnChars: 2000,
  tutorOutputChars: 8000,
  speechTranscriptChars: 8000,
  providerJsonChars: 128000,
  audioBytes: 8 * 1024 * 1024,
  audioDurationMs: 30000,
  reviewPage: 50,
  planActivities: 5,
  audioMimeTypes: [
    "audio/webm",
    "audio/ogg",
    "audio/wav",
    "audio/x-wav",
    "audio/mp4",
    "audio/mpeg",
  ] as const,
});
