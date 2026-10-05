# ADR 0013: Learner-confirmed vocabulary and deterministic reviews

## Status

Accepted for M08 (2026-10-05).

## Decision

Canonical, current, successfully validated report corrections are the source of
`vocabulary-suggestion-v1` suggestions. A correction `practice` value is only a
candidate when it is short, phrase-shaped English text (1–12 words, at most 160
characters) and contains neither Spanish diacritics nor known Spanish
instructional/meta terms. The explanation is the sense, and evidence stores only turn
coordinates. It is contextual report/tutor material, never represented as a
learner quote. Help turns and reports with invalid, empty, skipped, failed, or
superseded evidence create no active suggestion. Suggestions are conservative,
local and deterministic; no provider or dictionary is called.

A suggestion is inert until the learner selects **Añadir al repaso**. Ignoring
it creates no card. Confirmation is serialized per account and is idempotent.
Identity uses Unicode NFKC, locale-stable lower casing, replacement of Unicode
punctuation/symbol runs with spaces, whitespace collapse and trim. Phrase and
sense are normalized independently. `(account, normalized phrase, normalized
sense)` is unique; different explicit senses remain different cards. This does
not attempt semantic synonym merging.

`vocab-scheduler-v1` stores all times as PostgreSQL `TIMESTAMPTZ` instants and
uses the transaction's server timestamp. New cards are due immediately. Ratings
produce these interval minutes from the prior interval `i`:

| Rating | Interval | Repetitions |
| --- | --- | --- |
| Again | 10 minutes | reset to 0 |
| Hard | `max(1 day, round(i × 1.2))` | +1 |
| Good | `max(1 day, round(i × 2.5))` | +1 |
| Easy | `max(4 days, round(i × 4))` | +1 |

All results are capped at 180 days. The next due instant is exactly review time
plus the interval, independent of local midnight or DST. This deliberately
small algorithm is reproducible, not scientifically validated and not claimed
to be optimal for retention.

Every accepted review atomically advances the optimistic card version and
appends an immutable event containing previous/resulting states. A unique
account-scoped review key returns the original logical result on repetition;
reuse with different contents conflicts. A new key with an old expected card
version returns `STALE_CARD_VERSION` (HTTP 409), never a silent second advance.
Due reads include `due_at <= server now`, order by due instant then card ID, and
have a 1–50 bound.

Report deletion or in-place content/revision/analysis supersession changes a
pending suggestion to the distinct `invalidated` state; it never records the
learner's `ignored` intent. This clears its report/revision provenance, allowing
new canonical evidence to create a fresh suggestion without resurrecting the old
one. A confirmed card remains learner-owned; its source is cleared and marked unavailable rather
than silently deleting study material. Account deletion still cascades through
suggestions, cards and history. All routes derive ownership from authentication,
and mutations use existing CSRF/origin protections.

## Consequences

Review state survives reloads and is auditable. Shared decks, dictionary
scraping, offline sync, streaks, plans, and paid/cloud scheduling remain outside
M08.
