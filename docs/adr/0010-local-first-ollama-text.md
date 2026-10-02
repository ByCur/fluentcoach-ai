# ADR 0010: Local-first Ollama text AI

- **Status:** accepted
- **Date:** 2026-10-02
- **Scope:** text tutoring and post-session analysis only

## Decision

Use a local Ollama instance as FluentCoach's default text provider. The
infrastructure adapter implements the existing application-owned
`ConversationProvider` and `SessionAnalyzer` ports and reuses the versioned tutor
and analysis prompts, report schema, provider metadata, and `AiError` model.
Defaults are `http://127.0.0.1:11434` and `llama3.2:3b`; neither an API key nor a
provider SDK is required.

Gemini is retained as an explicit `gemini-free` option with its existing
approval, synthetic-only, quota, and key controls. `AI_FALLBACK_PROVIDER` remains
`none`: Ollama connection, timeout, or model errors fail closed and never cause
learner content to leave the machine. Selecting Gemini is a deliberate runtime
configuration change, not failure recovery.

The Ollama adapter sends a system message containing the application prompt and
a separate user message containing serialized context/input. Tutor responses are
normalized into the existing stream shape (one text chunk plus final metadata).
Analysis requests use Ollama's JSON-schema format and remain subject to existing
application report/evidence validation. HTTP responses are bounded, requests
have a 25-second default timeout, and connection, timeout, unavailable-model,
rate-limit, cancellation, and malformed-output failures map to existing
content-free AI errors.

## Consequences and limits

Local inference removes recurring text API cost and makes local privacy the
default. Model installation, host reachability, memory, latency, and updates are
operator responsibilities. Containerized API processes may need an explicit
host address rather than the loopback default. The adapter does not silently
pull models because downloads are large, mutate the host, and make startup
non-deterministic.

This decision does not implement or change Whisper, speech recognition, TTS,
realtime voice, or Gemini Live. Ollama responses remain untrusted; the existing
schema, evidence, ownership, and persistence checks still govern all applied
analysis. Automated tests mock `fetch`; the opt-in smoke command is the only
check that needs a real local Ollama process.
