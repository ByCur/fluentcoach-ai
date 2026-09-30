# M03/M04 acceptance evidence — 2026-09-30

Validated on the existing `codex/m03-m04-hardening` branch after fetching origin.
Node 20.20.0, pnpm 10.28.1, PostgreSQL 17.6 and Redis 8.2.1; isolated synthetic
data and `BILLING_MODE=free_only`. No real learner data or paid/live AI calls.

## Demonstrated acceptance

| Criterion | Evidence |
| --- | --- |
| Six scenarios and A1/A2/B1/B2 selectable; immutable settings | Browser tests inspect scenario options and start all four levels; PostgreSQL tests persist all 24 scenario/level combinations and change profile preferences without changing snapshots. |
| Mode policy, Spanish help, English continuation | Unit/contract tests and keyboard browser conversation verify teaching corrections, deferred natural corrections and English after Spanish help. |
| Ordered, harmless repeated turns/end | Session tests scope turn keys to each session; in-flight retries share one result; eight concurrent finalizations create one snapshot/run/outbox. |
| Terminal immutability and late evidence | Stale saves fail after end. End waits at most five seconds. Explicit late revisions create one new snapshot/run/outbox under concurrent retries; identical content and source-key retries deduplicate, conflicting reuse fails. Original turns/settings/state/end time stay frozen. |
| Progressive SSE and reconnect/resume | A delayed three-chunk fake tutor reaches the browser while the POST is pending. Browser disconnect/reopen after chunk one resumes with cursor 1 and shows each chunk once. Authenticated HTTP tests prove `Last-Event-ID` overrides the original query cursor. A completed POST advances the client cursor, suppressing late duplicate deltas. |
| Stream/account isolation | Two real PostgreSQL accounts cannot read, stream, write, help, end, finalize or revise the other account's session. HTTP rejects foreign streams before SSE headers. Direct cross-account inserts/updates fail ownership foreign keys. Forged job account/session/revision envelopes cannot claim work. |
| History persists | Browser reload locates the specific completed session in persisted history. |
| Atomic end/revision and provider effects | Injected database constraints force outbox and provider-audit failures; real PostgreSQL rolls back all affected effects. Failed revisions do not advance the current revision. |
| Duplicate/restart/retry/recovery | Fresh stores/services, 12 concurrent deliveries, queue outage, lost published wake-ups, publisher acknowledgment loss, expired leases, stale worker results/failures and bounded crash-only/provider retries preserve one persistent provider effect. |
| Provider response/database ambiguity | Failure after a provider response rolls back the success/audit transaction and permits recovery. Lost acknowledgment after committed success cannot reset the run or duplicate its audit. External provider execution may repeat. |
| Inspectable failures, empty/partial sessions | Attempts, fixed error codes and terminal failure persist. Empty evidence is skipped with terminalized outbox; abandoned sessions retain their state and carry explicitly partial evidence. |
| QStash verification | Current and next keys succeed. Wrong raw body, wrong URL, expired/missing-expiry token, invalid signature and unsigned reconcile fail. Both HTTP endpoints verify before effects; signed reconcile cannot accept analysis-endpoint replay. Malformed job envelopes and missing key configuration fail closed. |
| Migration compatibility | Empty database applies all four committed migrations. A nonempty M03/M04 schema upgrades through the additive migration, preserving ended state and backfilling evidence. Ownership constraints and application rollback limits are documented in ADR 0008. |

## Gate results

All commands below passed in one final sequential run. No tests were skipped.

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Passed; lockfile unchanged |
| `pnpm lint` | Passed, all existing rules enabled |
| `pnpm typecheck` | Passed, including root tests and fixtures |
| `pnpm test:unit` | 35 passed |
| `pnpm test:boundaries` | 2 passed |
| `pnpm build` | All workspaces passed |
| `docker compose config --quiet` | Passed |
| `pnpm exec prisma validate --schema packages/infrastructure/prisma/schema.prisma` | Passed |
| `pnpm db:migrate:test` | Four migrations applied |
| `pnpm test:integration:identity` | 16 passed |
| `pnpm test:integration:sessions` | 7 passed |
| `pnpm test:contract:ai` | 1 passed |
| `pnpm test:integration:jobs` | 7 passed |
| `pnpm test:resilience:jobs` | 8 passed against PostgreSQL |
| `pnpm test:e2e:onboarding` | 1 passed |
| `pnpm test:e2e:conversation` | 2 passed |
| `pnpm test:smoke` | 3 passed |

Total: 82 passing tests. PostgreSQL and Redis ran as real containers; Docker Hub's
rate limit was resolved by fetching the same pinned image versions from their
public ECR mirror. Typed lint uses an explicit 4 GiB heap budget; generated
Playwright artifacts are excluded from lint and Git, while source tests remain
checked. Database suites fail when DATABASE_URL is absent.

M03/M04 establish deterministic transport and persistence contracts. Live
QStash provisioning/scheduler setup and real AI quality are not demonstrated by
synthetic signature/provider tests; production setup is documented in ADR 0008.
M05 features remain unimplemented. This work is ready for review; no PR or merge
was performed.
