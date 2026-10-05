# M08 vocabulary data lifecycle

Current successful report evidence is rebuilt into pending suggestions on read.
Only explicit confirmation creates an active, immediately due card. Ignoring is
terminal for that suggestion and creates no scheduling data. Phrase/sense
identity, scheduling, UTC behavior, review idempotency and source invalidation
are specified in [ADR 0013](adr/0013-vocabulary-and-spaced-repetition.md).

The three canonical tables are `vocabulary_suggestions`, `vocabulary_cards`, and
`vocabulary_review_events`. PostgreSQL constraints enforce account-scoped card
identity and review-key uniqueness. The card is current persisted state; review
events are immutable audit history. API queries always include authenticated
account ownership. Browser account identifiers are neither accepted nor used.

Deleting or replacing a source report—including an in-place report update—moves
pending suggestions to `invalidated`, which is deliberately distinct from an
explicit learner `ignored` action. A later canonical report can therefore offer
a fresh suggestion while the old decision/audit row remains unambiguous.
Confirmed cards remain until the learner/account lifecycle removes them, but
their provenance fields are cleared and `source_available=false`. Account
deletion cascades all three tables. No audio, shared deck, dictionary scrape,
provider prompt, or cloud dependency is introduced.

M09 extends canonical review events with immutable `timezone_at_event` and
`local_date` snapshots. It reads these events directly for review activity; it
does not create duplicate review progress records. Scheduling still uses UTC
instants and the existing M08 algorithm. Pre-M09 review dates are explicitly
backfilled in UTC; see [M09 lifecycle](m09-data-lifecycle.md).
