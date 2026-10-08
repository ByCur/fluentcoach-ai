# ADR 0021 — Roadmap orphan recovery and durable tutor openings

Status: Accepted for implementation; live local semantic review remains required.

The persistent local demo can accumulate five unfinished practices. The M10
`privacy_open_session_cap` then raises SQLSTATE `55000` / `OPEN_SESSION_LIMIT`,
returned by the API as structured HTTP 409. The cap remains five.

Before a roadmap start inserts a practice, the existing account-locked transaction
marks orphaned CREATED sessions ABANDONED and timestamps their end. It retains
learner/tutor turns, live turn leases, ACTIVE sessions and started activities of
active owned plans. It never deletes history. Start receipt replay remains before
version validation; cleanup and linking commit with the same start transaction.
A rejected insert rolls back cleanup. A meaningful cap returns `retryable: false`
and Spanish guidance to finish an existing practice. LearnerHome renders errors
under the CTA. Only recognized version/activity conflicts refresh the canonical
roadmap; it resumes a committed link or retries the same pending current activity
once. A changed plan/activity never starts automatically.

A session's persisted UUID last hexadecimal digit determines who opens: even is
tutor, odd is learner. UUID v4 gives approximately half of sessions to each branch.
There is no browser randomness or new session column. Existing empty sessions are also
eligible; conversations with existing turns remain unchanged.

An authenticated, CSRF-protected POST `/api/v1/sessions/:id/opening` shares the
conversation turn lease and process in-flight guard. `opening.requested` commits
before inference. Any replay returns the owned session; it never invokes inference
again. `opening.completed` and one tutor turn with reserved source key
`tutor-opening:v1` commit together. A process crash after requesting an opener
falls back to learner-start on reload, rather than risking another generation.
Provider cancellation/deletion is fenced by the existing lease/account writes.

The application-owned optional opening port is implemented by local Ollama and
the deterministic CI fake; there is no paid or alternate provider fallback.
`tutor-opening-v1` supplies scenario, level and the linked roadmap title/type,
with no learner input or pseudo-turn. Output is capped at 500 characters,
30/40/50/60 words for A1/A2/B1/B2 and two sentences, under a ten-second deadline
and Ollama's 160-token output limit. Invalid output or outage records failure and
leaves the practice usable. English/scenario suitability is prompt-guided and
requires live semantic review; structural validation does not certify quality.

The browser opens the practice immediately, shows a brief opening status, then
renders the persisted tutor turn through the normal transcript/speech path.
An in-flight receipt after reload is recovered with bounded canonical GET polling,
without another generation request. Input waits only during this bounded opening request. Provider failure gives a
small Spanish fallback message. Openers emit no practice events. Existing report,
recurring-issue and vocabulary evidence validation accepts only learner turns;
an opener-only finalization is SKIPPED and cannot complete a roadmap activity.

Migration `202610070001_tutor_opening_progress` replaces the completion trigger:
opening-requested sessions need an accepted learner text/voice practice event to
emit completion progress. It preserves old history and non-opening behavior. Apply
it before the new API; readiness and release identity require it. The compatible
previous image is the roadmap release. The turn lease now locks accounts before
sessions, matching cleanup/transcript writes and avoiding inverted lock order.

Compatibility: additive endpoint/events and response fields. Rollback
to the previous app retains opener turns/history and the unchanged cap. Old code
ignores opening events; previously persisted tutor turns remain normal transcript
context. Do not discard opening receipts when retrying or restoring sessions.
