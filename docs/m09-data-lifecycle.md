# M09 plan and progress data lifecycle

For the current roadmap behavior and additive migration, see [ADR 0020](adr/0020-roadmap-first-learning.md). The rows below record legacy plan behavior.

Implementation ready for technical review. See [ADR 0014](adr/0014-plans-and-active-progress.md)
for complete versions, catalog selection, lifecycle, metric definitions and limits.

Canonical account-owned tables: `learning_plans`, `learning_plan_activities`,
`learning_plan_requests`, `practice_events`. Immutable M08
`vocabulary_review_events` remain the canonical review history; M09 adds event
local-date/timezone snapshots to them. No audio, plan prompts, paid AI call or
materialized daily aggregate is stored.

| Source/action | Effect |
| --- | --- |
| Successful accepted voice/text turn | Atomically append unique active event with successful reply |
| Failed/rejected/help/terminal/duplicate turn | No additional practice time |
| ENDED transition | One zero-duration completion event |
| ABANDONED/FAILED | No completion count |
| Refresh active plan | Current active retained; one proposal created/reused |
| Accept proposal | Prior active superseded atomically |
| Skip | Idempotent for same activity/version; no fabricated completion |
| Delete session or learner turn | Cascade its practice events; rebuild removes metrics/completion |
| Delete/invalidate/supersede report or dismiss issue | New plans exclude it; existing response redacts unavailable evidence; acceptance/start revalidate |
| Review card | Immutable M08 event, unique by account review key; no new progress copy |
| Delete review/card | Review metrics and activity completion rebuild from surviving sources |
| Change timezone | Only new events use new zone; historical saved dates unchanged |
| Delete account | Cascade all M09 tables and audit snapshots |

Rebuild strategy: call authenticated progress/current-plan reads; there is no
extra cache to clear or backfill. These rebuild M07 observations, read immutable
canonical sources, and deterministically project activities/counts. SQL composite
foreign keys prevent cross-account plan/session/turn ownership. Partial indexes
protect one active/current proposal. Account-row transactions serialize
lifecycle/idempotency mutations. Source events are immutable and uniquely scoped.
Use an installation with M09 migrated: missing migration or required columns is
not ready. Migration tests must run on an isolated test database.

Pre-M09 sessions/reviews explicitly use UTC snapshot backfill because their
historical timezone is unknown. They retain canonical timestamps and invent no
active voice/text duration. New historical dates are immutable.
