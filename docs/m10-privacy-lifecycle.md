# M10 privacy lifecycle

Status: **Implementation ready for technical review**. Synthetic validation is not
permission for a real-data pilot. No certification, production SLA or remote
provider deletion guarantee is claimed.

## Versions and ownership

Application-owned versions: `privacy-export-v1`, `privacy-job-v1`, `retention-v1`,
`deletion-v1`, `deletion-tombstone-v1`. Domain constants define policy; the
transport-neutral PrivacyService/PrivacyRepository port implements the lifecycle
through PostgreSQL. Browser ownership fields are rejected by strict schemas.
Privacy decisions do not use AI. Redis is non-canonical.

## Export

Authenticated `POST /api/v1/privacy/exports` accepts only a UUID `requestKey`.
Origin and current-session CSRF are required. Repeated keys return one logical
job. One pending export and three requests per rolling server day per account.
Authenticated `GET .../exports/:id` and `GET .../exports/:id/download` scope IDs to
the current account; missing and foreign IDs both return `EXPORT_NOT_FOUND`.
There is no public download URL or browser tombstone/deletion-job endpoint.

The JSON envelope contains `schemaVersion`, server `exportedAt` and these arrays:
accounts (product UUID/status/timestamps only), learner_profiles, practice_goals,
consent_records, practice_sessions and settings, conversation_turns,
session_events, transcript_revisions, analysis status, session_reports,
issue_observations, issue_dismissals including restoration timestamps,
vocabulary_suggestions/cards/review_events, learning_plans/activities, and
practice_events. The export uses an explicit column allowlist. Internal request
receipts/outbox/delivery data are operational implementation details, not extra
learner history. Provider prompts, provider-run metadata, raw OIDC subject,
leases, API/database/Redis credentials, cookies and CSRF/OIDC tokens are excluded.
No raw audio exists to export.

Snapshot generation and job/artifact completion use one PostgreSQL REPEATABLE
READ transaction and the canonical account mutex. All array reads see one MVCC
snapshot. A serialization failure rolls back and retries durably; it cannot
publish a mixed snapshot. Profile, vocabulary and plan concurrency is tested.

Temporary PostgreSQL JSONB is explicitly duplicated learner content, limited to
8 MiB by default (`PRIVACY_EXPORT_MAX_BYTES`, validated 1 KiB–64 MiB). A conservative
source-size check precedes materialization and the exact UTF-8 JSON size is
checked again. `EXPORT_TOO_LARGE` fails closed; nothing is silently truncated.
Artifacts expire exactly 24 hours after generation. Expiry uses server time;
download requires `expires_at > clock_timestamp()`. The reconciler deletes
expired copies, and deletion/retention immediately removes affected artifacts.
Downloads use JSON, no-store, nosniff and a fixed safe attachment filename.

## Deletion and fencing

`POST /api/v1/privacy/deletion` requires active authenticated session, CSRF,
Origin, UUID key and `confirmed: true`. The Spanish UI requires a deliberate
checkbox and enabled confirmation button. There is no password fiction. Recent
OIDC authentication is an M11 tenant-configuration/manual release gate.

One account-first transaction neutralizes outstanding analysis/turn leases,
removes analysis wakeups and exports, marks ACTIVE -> DELETING, monotonically
increments deletion_epoch, and commits a content-free tombstone plus deletion
job. Access is revoked at that commit, before asynchronous physical cleanup.
AuthGuard checks PostgreSQL on every request. The requesting Redis session and
cookie are removed; any other opaque TTL key cannot authorize a request.
SSE polls an account-active session read and closes after revocation. Voice,
turns, retries, plans, reviews, export and all learner reads fail closed.

Account status cannot return from DELETING to ACTIVE. Database learner-write
triggers independently serialize writes against the active account mutex.
Sessions, analysis runs and plans carry a persisted deletion epoch. New analysis
outbox envelopes include the epoch; legacy v1 envelopes without it are still
validated against their persisted run epoch. Claim and commit compare current
active account epoch; expired/cancelled leases cannot commit. Late provider
results cannot recreate reports, observations, vocabulary or progress.
Plan selection runs outside the account lock; the final transaction rechecks
epoch, account state and owned source eligibility before writing. No provider
call delays deletion by holding the account mutex.

Physical deletion removes vocabulary before source cascades, structured progress
before turn cascades, plans, standalone provider records and all remaining
account-owned canonical/derived rows. Export jobs disappear. Minimal deletion
job receipts (UUID, protocol/version, random request key, attempts/state and
fixed error code/timestamps) and tombstones remain, without learner text.
No completed state is written before all cleanup commits. Failed attempts roll
back and retry up to three times. A failed deletion leaves access revoked;
operators must investigate and explicitly requeue the content-free job rather
than restoring account access.

## Execution and limitations

The API lifecycle reconciler resumes PostgreSQL pending jobs every second and
runs retention hourly, including startup. No Redis or paid transport is needed.
`/api/v1/jobs/privacy` and `/api/v1/jobs/retention` require existing QStash signature
verification, including exact body and endpoint binding; browser credentials do
not grant execution authority. M11 may replace wakeups without rewriting ports.
Retention batches are independently transactional and rerunnable after process
failure. Safe telemetry reports outcomes, durations and counts only.

The tombstone ledger must be preserved separately from any old backup before
restoration. Ledger loss cannot be fixed by replaying that old backup alone.
Deleted UUIDs cannot be reinserted. A subsequently authorized fresh OIDC account
gets a new UUID and no old history; tombstones intentionally retain no raw OIDC
subject or matching identity hash.

Local Ollama and whisper.cpp remain the default, with browser speechSynthesis.
Audio is a bounded transient in-memory upload; no WAV/temp recording/file/blob
persistence is introduced. The schema gate rejects audio/blob/bytea columns.
**External provider retention/deletion must be independently verified before
enabling any optional remote provider for real learner data.**
