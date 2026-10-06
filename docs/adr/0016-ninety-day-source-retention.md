# ADR 0016 — UTC source retention and evidence invalidation

Status: Proposed for M10 technical review.

Policy `retention-v1`: cutoff = authoritative server UTC time minus exactly
90 * 86,400,000 milliseconds. A source session expires when
`COALESCE(ended_at,created_at) < cutoff`; equality is retained. This uses a source
session's end, or creation for unfinished sessions, consistently across its
transcript/report/evidence. It is independent of month/year/DST/timezone changes.
The test adapter exposes a clock only to trusted integration code, never HTTP.

Process at most 25 source sessions per account transaction, in deterministic ID
order. Reruns detect only surviving source content; completed work is a no-op.
Account mutexes serialize deletion, export and source invalidation. A failure
rolls back one whole batch and a rerun resumes safely. Hourly execution and signed
internal wakeups use the same service.

Remove conversation text, all transcript revision JSON/receipts, reports,
analysis/provider/outbox source jobs and session-event payloads. Old unfinished
sessions become FAILED and their turn leases are revoked. Minimum session shell
and settings remain for history; no old text remains in that shell.

M07 observations cascade when reports/revisions disappear. The existing SQL view
and validated on-read rebuild deterministically expose only surviving evidence.
M08 source-derived suggestions are physically removed, including their copied
phrases/evidence. Confirmed learner-owned cards and immutable structured review
history remain; all source IDs/provenance are cleared and unavailable.
M09 conservatively scrubs all issue evidence from account plan source snapshots
when any source batch expires, replaces rationale with neutral availability copy
and removes activity evidence/card references, marking source-dependent
activities unavailable. This may invalidate a still-current evidence activity;
a refreshed plan rebuilds it from surviving authoritative sources. Conversation
activities remain usable. No copied quotes are retained.

Content-free practice duration/completion events survive transcript deletion:
retention explicitly detaches the turn reference inside a trusted, versioned transaction (the ordinary turn FK remains CASCADE) but account/session/date/duration remain immutable. Review
history, goals and profile remain until account deletion. No fresh or fabricated
progress is created. Temporary export artifacts for affected accounts are also
removed so a pre-purge copy cannot expose expired evidence.
