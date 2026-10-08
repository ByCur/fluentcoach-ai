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
application report/evidence validation. HTTP responses are bounded. Tutor turns
remain capped at 25 seconds, tutor openings at 10 seconds, and roadmap selection
at 3 seconds. Report analysis uses `OLLAMA_ANALYSIS_TIMEOUT_MS` (default 90000;
validated integer range 30000–120000) in both the application service and adapter,
including response-body reads. All local `/api/chat` requests use Ollama's
supported `keep_alive: "10m"` to keep the model warm between turns and the report.
Connection, timeout, unavailable-model,
rate-limit, cancellation, and malformed-output failures map to existing
content-free AI errors.

Analysis jobs use a 150-second lease: the maximum 120-second analysis deadline
plus 30 seconds for database reads, validation and persistence. Reconciliation
only republishes running jobs after lease expiry; claim tokens and transactional
report/audit/evidence writes continue to fence stale workers. A failed report
retry resets the same run, clears its old lease/token and republishes its outbox
event for the same immutable transcript revision. Practice and progress persist
independently of report failure. No schema migration is required; rollback
restores the shorter deadlines/leases, so drain in-flight analysis first.

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
