# ADR 0008: Durable background execution

Status: Accepted (M04)

Session finalization, its versioned analysis run, and its outbox event must share a PostgreSQL transaction. PostgreSQL remains canonical. QStash is an at-least-once wake-up transport calling a signature-verified API endpoint; Redis loss cannot remove work. A PostgreSQL reconciler republishes unpublished work.

Workers claim bounded leases and persist attempts, stable error codes, and provider-run audit metadata. Unique logical keys make persistent effects idempotent across duplicate delivery and restart. Provider execution itself can repeat after an ambiguous timeout and is not described as exactly once. Empty sessions are explicitly skipped; late turns create a new transcript revision. BullMQ remains a future adapter and is not required by the free-only pilot.

## M03/M04 hardening (2026-09-30)

A forward migration adds composite account-ownership foreign keys from sessions
to profiles, analyses to sessions, provider audits to analyses, and the M04
outbox to sessions. Provider effects are unique per analysis run. Invalid
pre-existing ownership or duplicate provider effects make this migration fail;
correct them explicitly before a rollout rather than deleting evidence.

Finalization freezes ordered evidence in `transcript_revisions` in the same
transaction as session end, analysis and outbox. Empty evidence is skipped using
persisted turns, regardless of the caller's advisory flag. Abandoned/failed
sessions retain their terminal state and carry a partial snapshot. Text end
waits at most five seconds for the local in-flight tutor turn; database row locks
prevent late/stale writes from reopening or altering the terminal transcript.

Trusted application code can explicitly call `JobService.revise` with an
account, session, revision source key and a complete ordered transcript. This is
an internal M04 port, with no browser transcript ingestion endpoint. A source key
retry or equivalent content returns the existing revision; conflicting reuse of
a key fails. Genuinely new evidence atomically advances revision metadata and
creates one snapshot, analysis and outbox. Original turns, settings, state and
end time stay unchanged. Analysis content and report replacement remain M05.

Claims compare the complete job envelope with persisted ownership, session and
revision. Each attempt is a fencing token: older workers cannot commit success
or failure after another claim. Provider audit insertion and success commit
atomically. Caught failures reopen the outbox for bounded retries. Reconciliation
also republishes pending work published over 30 seconds ago and running work
with an expired lease, recovering a lost wake-up or worker crash. Crash-only
attempts count toward the same retry bound; exhausted work stays inspectably
failed. Exception content is replaced by fixed error codes.

SSE authorizes before sending headers, polls PostgreSQL for incremental deltas,
and stays open across completed turns. It rotates the connection after 30
seconds; browser EventSource reconnect uses `Last-Event-ID`, which takes
precedence over the initial query cursor. Explicit disconnect/reopen uses the
last accepted query cursor. The client drops already accepted sequences and
advances its cursor when a completed POST supplies authoritative turns.

Rollout: stop old session/job writers, apply the additive migration, and deploy
these writers together. The migration backfills already finalized transcripts.
Application rollback retains the added constraints and revision/audit data;
there is no automatic destructive down migration. Do not discard revisions to
roll back code. A signed scheduler must call `/api/v1/jobs/reconcile` regularly
for unattended recovery. Synthetic tests establish these persistence and
transport contracts, not live QStash provisioning or AI quality. Redis is not a
job dependency; deleting its delivery/cache state cannot remove canonical work.
Queue health is inspectable through analysis status/attempts/error/lease and
outbox published time/attempts, with PostgreSQL as the source of truth.
