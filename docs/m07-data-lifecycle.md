# M07 recurring issue data lifecycle

The forward migration `202610050001_m07_recurring_issues` adds
`issue_observations`, `issue_dismissals`, a composite report source identity, and
the derived `recurring_issue_aggregates` SQL view. Prisma models the persisted
rows and their relations; the view and check constraints are migration-owned.
Historical migrations are unchanged. The full chain supports empty databases;
the upgrade gate applies M07 over an existing schema containing a learner report.
No audio, provider credential, cloud dependency or profile trait is introduced.

Observations reference the complete report/account/session/revision/analysis-run
identity through a composite foreign key and the transcript revision through a
cascading foreign key. A foreign account, report, revision or analysis run cannot
be substituted. Session/report/transcript/account deletion cascades observations.
The view joins current session revision and successful analysis and filters the
rolling 30-day window at read time. Application reads revalidate report evidence
and rebuild before returning any priorities or excerpts; the view alone does
not validate pedagogical evidence and is not exposed to browsers.

Only one current report per session contributes. Revision admission removes old
observations immediately, even while replacement analysis is pending or fails.
Success replaces observations before updating the report source identity, then
commits evidence, provider audit and job success together. Failed/empty/skipped
analysis produces no observations. Retries use the existing lease fencing and
duplicate delivery cannot reapply success. Existing `analysis-v2` run identities
remain usable for idempotent revision/finalization receipts; new runs and provider
metadata use `analysis-v3`. No persisted historical report is reclassified with AI.

The repair entry point is `PostgresIssueRepository.list(accountId)` (also used
by issue actions), with the account supplied only by authenticated server state.
It reconstructs observations from current successful reports and exact frozen
learner excerpts, excluding help turns and “No entiendo” / “I don't understand”.
Invalid reports contribute nothing. The rebuild changes no report or dismissal.
It can be rerun with identical inputs and time to obtain identical observations
and priorities. Rebuilding after source deletion or evidence corruption removes
that source from all counts. Session completion time anchors occurrences; old
sessions cannot become recent by being reanalysed.

Authenticated routes:

- `GET /api/v1/issues`: currently recurring issues, counts, dates, dismissal flag,
  and exact validated evidence with report/run/revision/session identities.
- `GET /api/v1/issues/:key/evidence`: that account's currently recurring evidence;
  returns 404 if absent.
- `POST /api/v1/issues/:key/dismiss` and `/restore`: empty JSON body, existing
  CSRF token and exact origin required; account/taxonomy/key dismissal scope.

All path/query/body input is validated with contracts. Unsupported keys and
extra query/body fields (including `accountId`) fail closed. There is no browser
account selector. A key shared by two accounts always addresses the caller's own
priority. Existing account authentication/status checks remain in force.

`language-issues-v1` needs 3 observations across 2 sessions within 30 days; one
issue/learner-turn is one observation. Stable headings and frozen bilingual
aliases are described in ADR 0012 and domain source. Unknown headings intentionally
produce no priority. Dismissal persists until restore, including new evidence and
periods without a recurring aggregate. The database retains latest dismissal and
restoration timestamps. Quotes are copied from accepted evidence, never generated.

Compatibility/rollback: deploy the forward migration before new binaries; schema
readiness requires M07. Stop new binaries before rollback. Dropping the view,
observations and dismissal tables and added source unique constraint loses
learner dismissal history; observations can be regenerated from reports, while
dismissals require backup recovery. Do not delete report/transcript evidence as
part of code rollback. Existing reports and local voice/text behavior are unchanged.
