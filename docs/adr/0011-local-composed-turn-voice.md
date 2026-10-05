# ADR 0011: Local composed turn-based voice

- **Status:** accepted
- **Date:** 2026-10-02
- **Scope:** M06 push-to-talk voice
- **Supersedes:** ADR 0002/0005 Gemini Live as the default M06 voice design

## Decision

M06 uses a composed local-first pipeline: browser `MediaRecorder` capture sends
one authenticated, bounded audio turn to FluentCoach; an application-owned
`SpeechTranscriber` port invokes the official local whisper.cpp HTTP server;
the transcript enters the existing session turn and Ollama `ConversationProvider`
path; the browser immediately renders captions and optionally reads the tutor
text with `speechSynthesis`.

Defaults are `SPEECH_PROVIDER=whisper-cpp`,
`WHISPER_BASE_URL=http://127.0.0.1:8080`, `WHISPER_LANGUAGE=auto`, and
`WHISPER_TIMEOUT_MS=45000`. The adapter uses multipart `POST /inference` with
`response_format=json`. whisper-server runs with `--convert` and host ffmpeg for
common browser WebM/Opus input. Neither binaries nor models are downloaded or
committed by FluentCoach.

The initial host gate uses the multilingual Whisper `base` model with automatic
language detection. Practice is primarily English, but Spanish help triggers such
as “No entiendo” must remain transcribable, so an English-only `.en` model is not
the default. A multilingual `small` quality/latency comparison is deferred until
after the first real smoke and device validation; no larger default is selected.

Audio remains in memory only and is discarded after transcription. One turn is
limited to 30 seconds and 8 MiB with an allowlist of browser audio MIME types.
Transcripts follow the same ownership, terminal-state, locking, idempotency and
persistence rules as typed turns. Provider errors are content-free. Audio and
transcript contents are never logged.

Gemini Live is only a possible future, explicit provider behind a new decision,
privacy review and evaluation. It is not configured, required, or an automatic
fallback. Connection/timeout failures fail closed while typed practice remains.

## Consequences and limits

This is push-to-talk, not continuous/full-duplex media. There is no pronunciation
scoring. The declared recording duration is bounded in both browser and API
envelope; the 8 MiB server limit is independently authoritative. This milestone
does not decode media in FluentCoach to independently measure duration.

Browser speech synthesis availability, voice quality and offline behavior vary.
It never blocks caption display. FluentCoach incurs no TTS API cost, but does not
claim that the browser voice is offline. Local operators own whisper.cpp, ffmpeg,
the selected model, host reachability, latency and model licensing.
