# ADR 0008: Durable background execution

Status: Accepted (M04)

Session finalization, its versioned analysis run, and its outbox event must share a PostgreSQL transaction. PostgreSQL remains canonical. QStash is an at-least-once wake-up transport calling a signature-verified API endpoint; Redis loss cannot remove work. A PostgreSQL reconciler republishes unpublished work.

Workers claim bounded leases and persist attempts, stable error codes, and provider-run audit metadata. Unique logical keys make persistent effects idempotent across duplicate delivery and restart. Provider execution itself can repeat after an ambiguous timeout and is not described as exactly once. Empty sessions are explicitly skipped; late turns create a new transcript revision. BullMQ remains a future adapter and is not required by the free-only pilot.
