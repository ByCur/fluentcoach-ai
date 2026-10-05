# M07 validation — 2026-10-05

Implemented from `main` commit `f75328c` on `codex/m07-recurring-issues`.
Validation used Node 20.20.0, pnpm 10.28.1, real PostgreSQL 17.6 and Redis 8.2.1,
Playwright Chromium 140, and deterministic fake text/speech providers.
No paid provider, live learner data or persisted raw audio was used.

Final command results (exit code 0 for every listed command):

| Command | Result |
| --- | --- |
| `pnpm lint` | Passed, no lint errors |
| `pnpm typecheck` | All workspace packages and root test/script types passed |
| `pnpm test:unit` | 115 tests passed, 21 files |
| `pnpm test:boundaries` | 2 tests passed, 1 file |
| `pnpm build` | All workspace builds passed; production web bundle generated |
| `pnpm db:migrate:test` | All 7 committed migrations applied to an empty database |
| `pnpm test:integration:issues` | 19 tests passed, 3 files |
| `pnpm test:e2e:issues` | 1 browser test passed |
| `pnpm test:integration:analysis` | 18 tests passed, 3 files |
| `pnpm test:integration:sessions` | 12 tests passed, 3 files |
| `pnpm test:integration:jobs` | 7 tests passed, 2 files |
| `pnpm test:resilience:jobs` | 8 tests passed, 1 file |
| `pnpm test:contract:ai` | 36 tests passed, 3 files |
| `pnpm test:e2e:reports` | 5 browser tests passed |
| `pnpm test:e2e:conversation` | 2 browser tests passed |
| `pnpm test:e2e:voice` | 8 browser tests passed |
| `pnpm exec prisma validate --schema packages/infrastructure/prisma/schema.prisma` | Schema valid |
| `pnpm eval:ai -- --suite pilot-text --billing-mode free_only --output /tmp/m07-tools/eval.json` | 48/48 synthetic cases; 144 fake calls; policy/evidence checks passed |

Required test commands collected **233 passing tests**, with no skipped tests.
The initial new browser fixture failed during API-request login setup; it now
logs in through the actual browser login action with a unique synthetic account,
and the complete threshold/evidence/dismiss/reload/restore flow passes.
Vitest and Playwright keep their default nonzero exit for zero collected tests;
the new gate scripts execute the real test runners, with no success placeholders.

M07 coverage includes version/key validation and conservative headings; exact
cutoff/future dates; 3 observations in one session versus 3 across two; repeated
finding/quote deduplication; deterministic rebuild and lost materialization;
concurrent delivery/rebuild/dismissal; successful retry and transactional rollback;
current report replacement and pending supersession; legacy analysis-v2 receipts;
old practice dates after reanalysis; invalid quotes, help turns, empty/failed
reports; source/session/transcript/account deletion; dismissal surviving new
observations/disappearance/rebuild; explicit restore; and adversarial two-account
read/evidence/dismiss/restore with transport spoofing, CSRF and origin rejection.
The migration upgrade test preserves an existing report while applying M07 and
checks uniqueness and composite source identity constraints.

## Changed implementation and schema

- Domain: `packages/domain/src/issues.ts` and exports — eight-category
  `language-issues-v1`, 3/2/30 policy, deterministic aggregate algorithm.
- Application: `packages/application/src/issues.ts`, exports and `ai.ts` —
  validated report observations, account-scoped service/port, `analysis-v3`.
- Infrastructure: `issue-repository.ts`, `job-repository.ts`, `ai-prompts.ts`,
  schema readiness and exports — transactional persistence, rebuild/revalidation,
  current-revision invalidation, stable headings and legacy receipt compatibility.
- Prisma: `schema.prisma`; new forward migration
  `202610050001_m07_recurring_issues/migration.sql` — observations, dismissals,
  composite/cascading source constraints and derived recurring aggregate view.
- API: `issue.controller.ts`, module registration, not-found error handling;
  contracts define strict issue path/query/action validation.
- Web: `issues-panel.tsx`, practice-screen integration and explicit domain type
  dependency — Spanish active priorities, exact examples, dismissal and restore.
- Testing/configuration: domain/application unit tests, prompt policy test,
  synthetic analyzer corrections, three issue integration files, issue E2E;
  root scripts, Vitest project, CI and workspace dependency lockfile.
- Documentation: PLAN M07 status, DOCUMENTATION, ADR 0012, M07 data lifecycle
  and this validation record. Historical migrations and M08+ remain unchanged.

## Remaining manual validation

Review real local Ollama `analysis-v3` grammar/vocabulary category quality on
synthetic practice across sessions, including unclassified findings and help.
Review Spanish wording and keyboard/screen-reader evidence, dismissal and restore
controls in the supported browser. Reconfirm normal local text/voice behavior on
the owner's Ollama/whisper.cpp/browser speechSynthesis host/device combination.
The synthetic evaluation validates policy/evidence contracts, not model teaching
quality or certified proficiency. Existing real-learner release/privacy gates
remain in force. This milestone introduces no CEFR, pronunciation, psychological
assessment, vocabulary scheduler or generated plan.
