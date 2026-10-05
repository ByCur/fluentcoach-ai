# ADR 0014: Versioned practice plans and canonical active progress

## Status

Implementation ready for technical review (M09, 2026-10-05). Required CI
PostgreSQL/Redis/Chromium gates must pass before milestone completion.

## Decision

Use `plan-v1`, `plan-generator-v1`, and `plan-catalog-v1`. The application-owned
`PlanGenerator` port selects only server-created candidate IDs. Its normal and
CI double (`FakePlanGenerator`) follows the deterministic normal policy: active M07 issues in taxonomy order (up to
two), then a due vocabulary group (up to five cards), then conversations. Select
at most four activities; conversation candidates ensure a two-activity starter
plan without invented weaknesses. Conversation duration is half the daily goal,
rounded down and bounded to 2–10 minutes. Review duration is bounded to five
minutes. Prefer scenarios absent from the last ten ENDED sessions, with slug
ordering as deterministic tie-break. Selected CEFR is a learner preference, not
an assessment. No provider, prompt, cloud fallback, AI billing, or plan-quality
claim is introduced. Ollama text, whisper.cpp STT and browser speechSynthesis
remain the normal conversation path.

The catalog contains conversation, recurring-issue-practice and vocabulary-review.
Correction practice is not a separate v1 activity. Recurring activities carry
taxonomy keys and exact validated report references. Vocabulary candidates use
confirmed, active, currently due cards with available provenance whose current
successful report passes runtime evidence validation. M08 cards with unavailable
provenance remain reviewable in M08, but do not personalize a new M09 plan.
Dismissed issues, help, foreign or nonexistent evidence, future cards, ignored
suggestions, failed/superseded/deleted sources are ineligible. Malformed selection,
unknown candidate IDs, unsupported fields/types or duplicate selections reject
with retryable HTTP 503; the transaction rolls back and progress stays available.
References are checked after generation and again at acceptance/start. Profile
and goal version changes reject acceptance and require a refreshed proposal.

An insufficient-data starter explicitly explains that it uses selected level and
goal. Activities explain the actual observation/session counts, pending card
count or selected level/goal. These are practice recommendations, not claims of
fluency, psychological traits, assessed CEFR or scientifically validated progress.

## Lifecycle

Every authenticated account has at most one proposal and one active plan,
protected by PostgreSQL partial unique indexes and account-row serialization.
Generate takes a UUID request key. Repeating the same request returns its current
result; conflicting use of a key is HTTP 409. Generate while a proposal exists
returns that proposal. Refresh of an active plan creates (or returns) a proposal,
leaving the active plan intact. Refresh of a proposal explicitly replaces it.
Concurrent refresh of the same proposal permits one replacement and conflicts
with stale requests. Acceptance atomically supersedes the old active plan and
activates the proposal. Repeated acceptance with its original acceptance version
is idempotent while that plan remains active; replay on a superseded plan conflicts.

Mutations carry optimistic `expectedVersion`. Accept/skip/start increment it.
Skip records the version that produced it: identical repeated skip is idempotent
on the same current plan, while unrelated stale mutations conflict. Reads rebuild
activity availability and completion without incrementing the mutation version;
mutations recheck their current source eligibility rather than trusting a read.
Unavailable evidence/card IDs are removed from responses; the input snapshot is
kept as account-owned audit data, but responses exclude its copied evidence/IDs.
Account status must be ACTIVE, and all queries and composite foreign keys are
account-scoped. There is no browser-owned practice-event mutation endpoint.

Starting a conversation/issue activity creates one linked session with scenario,
level and mode from its catalog definition. Clicking does not complete it.
Completion requires that linked session be ENDED and have a surviving accepted
voice/text event. It does not certify that an issue was resolved or that target
minutes were achieved. Review completion requires distinct target-card M08 review
events after the activity's server start timestamp, at least `targetCount`.
Repeated reviews of one card cannot satisfy a multi-card activity. Completed and
unavailable states are deterministically rebuilt from surviving sources; source
removal removes derived completion. There is no arbitrary “done” endpoint.

## Active time and dates

A successful conversation turn persists a practice event in the same transaction
as its completed tutor reply. A learner turn saved before a provider failure
contributes zero until it successfully enters the normal conversation flow.
Help text/voice contributes zero. Voice uses the already validated 1–30,000 ms
recording metadata (not STT elapsed time or session duration); this is bounded
client-declared telemetry, not a physical measurement of speech. No raw audio is
stored. Voice and text share a source identity, so a duplicate or cross-channel
replay cannot count twice. Canonical event keys use a `turn:` namespace; session
completion uses its own key and cannot collide with a browser turn key.

Text accepts optional integer `activeDurationMs` (nonnegative, transport bounded
at one day, clamped to five minutes per successful turn). Legacy requests record
zero. The browser accumulates intervals between active edits, excludes any gap
over 30 seconds, pauses on input/window blur and visibility changes, pauses before
send, retains the same duration on retry, and resets after successful send or new
session. The initial keystroke has no interval and contributes zero. Provider
latency, waiting, idle connections and pages left open never add time. This is
bounded progress telemetry, not security/billing accounting. It is deliberately
conservative and may undercount thinking or editing that produces no input event.

Each practice event records server `occurredAt` as a UTC instant,
`timezoneAtEvent` from the current validated learner IANA timezone, and `localDate`
at recording time. M09 profile/goal write triggers acquire the same account mutex
as event/plan commits. Application profile/goal/onboarding writers lock the account
before profile rows to preserve a consistent lock order. Concurrent profile
changes cannot replace the snapshot
before that transaction commits. SQL enforces their agreement and event updates are forbidden.
New M08 reviews sample `clock_timestamp()` after acquiring the account/card locks
to avoid attributing lock-wait time to a prior date. Review events gain the same
snapshot without creating duplicate review
history. A trigger on transition to ENDED records one zero-duration completion
event atomically with session finalization, including the existing outbox path.
ABANDONED/FAILED never produce completion events. Repeated end does not add one.

Pre-M09 completed sessions/reviews have no historical timezone snapshot. The
migration labels them UTC and derives dates from their canonical timestamps,
explicitly avoiding a claim to know past learner timezones. It backfills no
voice/text time: legacy practice never fabricates minutes. New snapshots are
never rewritten after profile timezone changes or DST.

## Metrics and limitations

Speaking streak: sum accepted voice milliseconds by persisted localDate; a date
qualifies at >=120,000 ms. Consecutive qualifying calendar dates extend a run;
missing/under-threshold days break it. Current streak ends today if qualified,
otherwise yesterday (today remains open); after a missed yesterday it is zero.
Longest streak scans all qualifying historical dates up to current local today.
Text, review, and session completion events never qualify. Calendar arithmetic
uses UTC date-only arithmetic, so DST does not change day lengths or adjacency.

Weekly goals: current IANA timezone determines today's date and the Monday
calendar boundary. Include events whose persisted localDate is between that
Monday and today, inclusive. Do not reproject old instants into the current zone;
an event recorded in another zone belongs to its saved calendar date, even if
its instant would map to another current-zone date. Practiced days require a
positive accepted voice/text duration, not a zero-time session or review.
Target minutes = current minutesPerDay × current daysPerWeek. Expose total active,
voice and text minutes separately, completed sessions lifetime/this week, target
and practiced days, and reviews today/this week plus M08 current due-card count.
Review counts come directly from immutable M08 events, deduplicated by their
existing account review key. They add no invented practice minutes.

Issue trends reuse M07 validation, current recurrence window (30 UTC days) and
dismissal rules. Show observation count, distinct observed sessions, evidence,
and two adjacent half-open 14-day UTC instant buckets ending at server now.
No directional inference is made: observation data lacks a comparable exposure
baseline. Always explain “Datos insuficientes para mostrar una tendencia.”
Fewer sessions/observations never become an improvement claim. Dismissal removes
current priorities while retaining M07's audit semantics.

## Rebuild, deletion and compatibility

There is no DailyProgress cache or independent aggregate table. Progress is
recomputed from canonical practice_events, practice_sessions, M07 validated
observations and M08 review events. Repeating a read/rebuild yields the same
counts. M07's account-serialized rebuild repairs observations after invalidation.
Activity states are projections of canonical linked sessions/reviews and source
eligibility. Removing a session/turn cascades its events; removing reviews/cards
removes corresponding review counts/completion. Account deletion cascades all
M09 plans, activities, request receipts and events. Source deletion does not
resurrect evidence during rebuild. Audit snapshots are deleted with their account.

Only forward migration `202610050003_m09_plans_progress` is added. Historical
M02–M08 migrations remain unchanged. Readiness requires it and M09 columns;
run deployment migration before starting the new API. Old clients can omit text
duration safely. Rollback needs the old application plus intentional handling
of the new tables/triggers; do not edit applied migration history.
