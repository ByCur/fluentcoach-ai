# ADR 0015 — Deletion epochs and a separable tombstone ledger

Status: Proposed for M10 technical review.

Deletion must revoke before destructive cleanup and remain safe if old jobs or
backups return. PostgreSQL owns an irreversible DELETING transition and monotonic
integer epoch. Every learner write has a database active-account guard. Long
analysis/plan operations recheck persisted epoch and account state at commit;
provider execution never authorizes privacy operations. Account-first lock order
avoids inversion with existing M09 profile/plan/review mutations.

Privacy jobs are durable, idempotent and content-free. Artifacts are separate
account-owned JSONB with 24-hour expiry and a fail-closed size limit. Analysis
lease fencing is retained in addition to deletion epochs. A rolled-back privacy
attempt remains retryable; receipts cannot claim completion before effects.

Tombstones retain only former account UUID, deletion epoch, requested/completed
timestamps, protocol and schema version. They contain no identity subject,
learner text or tokens. Requested tombstones are included in the ledger even
before cleanup finishes: restoration must honor revocation as well as completed
deletions. The export file is an operational ledger with restricted access,
separate from the historical database backup, never a public artifact.

Replay deletes all product state for those UUIDs transactionally, upserts the
maximum epoch and converges if interrupted. Replay twice is harmless. Traffic
must stay isolated until schema readiness and privacy verification succeed.
There is no automatic traffic switch or destructive down migration. Loss of the
external ledger, backup expiry policy and production credentials remain release
gates. A newly authorized identity may create a fresh empty account; preserving
identity hashes to prohibit that is intentionally outside this content-free
anti-resurrection protocol.
