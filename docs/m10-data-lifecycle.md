# M10 Prisma and persistence lifecycle

Forward migration: `202610060001_m10_privacy`. Earlier migrations are unchanged.
It adds deletion epochs on accounts/sessions/analysis/plans, privacy_jobs,
privacy_export_artifacts and deletion_tombstones, active-write and epoch/state
fences, concurrency-safe five-open-session cap, standalone provider owner FK,
and content-free progress preservation when transcript turns expire.

Prisma describes the new entities; explicit SQL owns transaction isolation,
mutex/epoch checks, composite ownership constraints, custom triggers and checks.
Readiness requires the committed M10 migration and every representative M10
column in addition to all M02–M09 checks. Missing epoch, privacy job, artifact or
tombstone columns return not-ready.

Rollout: pause old writers, preserve backup and independent tombstone ledger,
apply the forward migration, deploy compatible API/worker together, then verify
readiness/privacy. Old writers with no epoch cannot write to a later generation.
There is no automatic down migration. Do not restore a deleted account to undo
an operational error. See privacy lifecycle, ADR 0015/0016 and restore runbook.

Empty-database full chain, M09-to-M10 compatibility, missing-column readiness,
real transaction rollback and ownership are exercised by required gates.
