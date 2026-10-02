# ADR 0009: Bounded text AI and evidence-backed reports

> **Text-provider amendment (2026-10-02):** ADR 0010 makes local Ollama the
> default text provider. Gemini remains available only through explicit opt-in;
> the validation and safety decisions below still apply.

- **Status:** accepted for synthetic implementation; credentialed feasibility pending
- **Date:** 2026-09-30
- **Scope:** M05 text tutoring and automatic reports

## Decision

Use one Gemini Developer API REST adapter behind the application-owned
ConversationProvider and SessionAnalyzer ports. Keep keys on the server, streamed
text normalized to application events, and structured report output untrusted.
Prompts are `tutor-v2`/`analysis-v2`, the report schema is `report-v1`, and the rubric
is `pilot-text-v1`. Learner input is user data, never interpolated into system
instructions. No provider tools or direct state writes are enabled.

Each report finding includes an exact UTF-16 quote/span and learner turn sequence.
The application rejects invalid schemas, unknown versions/fields, fabricated or
out-of-bounds quotes, tutor/help evidence, and corrections based on explicit help
requests. It rejects the entire draft. PostgreSQL persistence validates again
against the account/session/revision while locking canonical state; account
revocation or a changed revision prevents application of an in-flight result.
Quote validity establishes provenance, not educational correctness: the human
rubric review remains necessary.

Report, successful provider audit, and analysis success commit together. Unique
report keys prevent duplicate persistent effects. Analysis lease tokens fence
stale responses, including after explicit retry resets attempts. Failed attempts
reopen the outbox; reconciliation also recovers expired leases and published work
that never started. Provider execution may repeat after an ambiguous failure.
Session turn leases prevent overlapping API instances from ordering conflicting
turns; terminal transcripts are immutable. Partial reports are identified from
the immutable revision snapshot, including abandoned/failed sessions, never provider claims.
Reports read the hardened M04 revision snapshots rather than mutable conversation
turns; explicit late evidence creates a new report without changing the frozen
user transcript.

Provider operations have a maximum 25-second deadline, abort propagation, bounded
input/output and response bytes, strict finish-state checks, and normalized
content-free errors. Failed text attempts retain the learner turn; retry uses its
original request key. The UI exposes report pending/failure/retry and cited
quotes. Ending a session waits at most five seconds for its in-flight turn, then freezes
evidence and cancels remaining local generation; a response arriving at
another API instance is prevented from changing the terminal transcript.

## Free-only admission

Production defaults to disabled AI and rejects the fake adapter. Live Gemini
requires an owner-attested Free-Tier review ID, a server key, an explicit model,
expiring quota verification, and conservative positive limits. There is no paid
provider, fallback, automatic model switch, or billing upgrade. Real learner
requests remain disabled: M05 supports owner-approved synthetic checks only;
M10/M11 still own real-data privacy and release readiness.

PostgreSQL reserves requests and a conservative UTF-8-byte input-token bound plus
maximum output tokens atomically for a UTC day and model. Reservations are never
refunded, including unknown usage, crashes, malformed output and repeated calls.
Reported reasoning tokens are included. A provider 429 or excessive reported
usage blocks further admissions for that day. These budgets are application caps,
not a discovery mechanism for project billing or free-tier eligibility. Owners
must verify the project's free-only status and remaining allocated quotas using
the official sources in ADR 0005 before enabling credentials.

Normal CI uses deterministic fake analysis and mocked synthetic Gemini HTTP/SSE
shapes. The versioned 48-case level/mode/scenario matrix includes Spanish help,
evidence checks and a human review rubric. Live evaluations require `--live`,
fail closed on missing approval/configuration, verify the model API's current
candidate and context/output limits, and run at most six calls per invocation
(including model verification). The model API does not attest Free-Tier daily
limits or data terms; those remain owner review evidence. No automatic malformed
output repair is attempted; bounded job retry is explicit and budgeted.

## Migration and rollback

Migration `202609300004_m05_reports` adds reports, quota reservations, ownership
foreign keys, provider usage fields and turn/analysis lease tokens. It requeues
M04 fake successes with usable current transcripts and skips empty ones. It
preserves transcripts and earlier audit records. Readiness now requires M05
migration completion and columns. Forward migration
`202609300005_m05_hardening_compatibility` preserves legacy fake-success audits as
session audits before generating a report, retaining M04's unique provider effect
per analysis. It also upgrades remaining M04 analyzer versions. Readiness requires
the hardening, report and compatibility migrations. Tests cover empty creation,
M04 upgrade and an existing M05 schema that receives the hardening afterward.

The migration is additive but dropping its tables loses reports and quota audit
history; production downgrade is not a supported rollback. Disable AI and pause
jobs before restoring the previous application. Preserve the database and use a
forward fix; re-enable only with compatible schema and reviewed quotas.

## Evidence and limitation

Deterministic contracts, real PostgreSQL transaction/upgrade tests, and browser
flows establish implementation behavior. They do not establish live Gemini
latency, current model availability, free eligibility/data terms, or educational
quality. This environment has no configured provider secret or owner approval;
the M05 live entry gate remains blocked, and M05 is not claimed complete.
