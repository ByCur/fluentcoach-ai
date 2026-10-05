# ADR 0012 — Current-report recurring language priorities

Status: accepted for M07 implementation; real local-model/browser validation pending.

PostgreSQL validated `report-v1` reports remain authoritative learner evidence.
M07 uses the domain-owned `language-issues-v1` taxonomy, with eight stable keys:
verb-tense, subject-verb-agreement, articles, prepositions, word-order,
vocabulary-choice, singular-plural, auxiliary-verbs. Labels are Spanish; seven categories describe grammar,
and vocabulary-choice describes vocabulary. These are priorities for practice,
not psychological profiles, scores, pronunciation or certified CEFR assessment.

`analysis-v3` asks for one explicit stable key at the start of each covered
correction heading. The report JSON schema remains `report-v1`. A deterministic
classifier recognizes these keys and a small frozen English/Spanish heading
alias list. It uses no vendor output field, additional AI call or dependency.
Unknown/ambiguous headings and strengths yield no issue observations. Existing
validated reports with recognized headings are eligible on rebuild; no provider
reanalysis is required. Semantic category accuracy still depends on the report:
evidence validation proves the quote, not the pedagogical conclusion.

A valid observation stores taxonomy version/key/label/category, account, session,
report, analysis run, transcript revision, exact accepted UTF-16 excerpt and
turn sequence, uncertainty and occurrence time. Count at most one observation
per issue per learner turn per session. Repeated findings, overlapping excerpts,
report retries and reanalysis cannot multiply that turn or its session.
Occurrence time is the original session completion time (`ended_at`, otherwise
`created_at`), because frozen transcript turns have no occurrence timestamps.
Reanalysis never refreshes the 30-day practice window.

An issue is recurring with at least **3 observations / 2 distinct sessions /
30 rolling days**, including both cutoff and current-time boundaries, excluding
future dates. The pure domain algorithm groups current validated observations;
the SQL `recurring_issue_aggregates` view provides independently inspectable
derived totals. Neither aggregates nor materialized observations replace reports
as the rebuild source.

Successful report persistence replaces observations in the same transaction as
report/audit/job success under the existing lease and account/session locks.
Revision changes remove the superseded observations in their transaction.
Pending, running, failed, skipped, missing, superseded and invalid reports cannot
contribute. Duplicate delivery has no extra effect. The account-scoped repository
rebuild (`list`) revalidates each current successful report against its immutable
transcript, replaces materialized observations deterministically, and computes
priorities. API reads and dismissal actions invoke this rebuild, repairing old
reports and materialization loss and removing invalid evidence. Rebuilds and
report commits serialize on the existing account row lock; observation insert
failure rolls back the entire report commit. No new outbox/delivery protocol.

Dismissal is separate account/taxonomy/key state. It remains effective through
new evidence, supersession, disappearance, time expiry and rebuild until explicit
restore. Repeated dismissal preserves its timestamp; restoration records a
separate timestamp. Re-dismissal after restoration starts a new dismissal period.
This row audits the latest dismissal/restoration; it is not a full event history.
The UI hides dismissed issues from active priorities and provides a separate
collapsed restore list only for currently recurring dismissed issues. The API
also permits restoring a saved dismissal while its issue is below threshold.
Account deletion cascades dismissal; source deletion never deletes dismissal.

This small initial data set is rebuilt per account on each read/action. This
favors correctness and current evidence over caching; a later optimization must
retain revalidation, rolling-window, deletion and deterministic rebuild semantics.
M08 vocabulary/reviews, M09 plans and later release features are out of scope.
