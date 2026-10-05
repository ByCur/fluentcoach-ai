# M09 technical validation

Status: **Implementation ready for technical review**. Required CI gates must
pass on the PR head before milestone completion; fake checks do not validate
live educational quality.

Base: latest `main` at `f502bf6b9ffc03f03dcb77d788c130f173e56247` (M08).
Local runtime: Node 20.20.0, pnpm 10.28.1, PostgreSQL 17.6, Redis 8.2.1,
Playwright Chromium 140.0.7339.186. Text/STT/plan CI doubles are deterministic.
No paid API or live provider call was made.

| Command | Local result |
| --- | --- |
| `pnpm lint` | Passed |
| `pnpm typecheck` | Passed |
| `pnpm build` | Passed |
| `pnpm exec prisma validate --schema packages/infrastructure/prisma/schema.prisma` | Passed |
| `pnpm db:migrate:test` | Passed: all 9 forward migrations applied to empty DB |
| `pnpm test:unit` | 159 passed |
| `pnpm test:boundaries` | 2 passed |
| `pnpm test:integration:identity` | 20 passed |
| `pnpm test:integration:sessions` | 12 passed |
| `pnpm test:integration:jobs` | 7 passed |
| `pnpm test:integration:analysis` | 18 passed |
| `pnpm test:integration:issues` | 19 passed |
| `pnpm test:integration:reviews` | 13 passed |
| `pnpm test:integration:plans` | 26 passed |
| `pnpm test:integration:progress` | 23 passed |
| `pnpm test:resilience:jobs` | 8 passed |
| `pnpm test:contract:ai` | 36 passed |
| `pnpm test:contract:voice` | 7 passed |
| `pnpm test:e2e:onboarding` | 2 passed |
| `pnpm test:e2e:conversation` | 2 passed |
| `pnpm test:e2e:reports` | 5 passed |
| `pnpm test:e2e:issues` | 1 passed |
| `pnpm test:e2e:vocabulary` | 1 passed |
| `pnpm test:e2e:voice` | 8 passed |
| `pnpm test:e2e:progress` | 2 passed |
| `pnpm test:smoke` | 3 passed |
| `pnpm eval:ai -- --suite pilot-text --billing-mode free_only` | 48/48 synthetic cases; 144 fake adapter invocations; no external calls |
| `docker compose config --quiet` | Passed |

There are 374 passing tests across the listed suites, plus 48 synthetic evaluation
cases. Initial browser checks exposed an ambiguous vocabulary status selector
(now scoped to its section); development-API restarts during source edits also
caused temporary failures. The stable regression rerun passed every suite.
Identity, plans, progress and onboarding were rerun after the final profile-lock
change. CI executes the entire gate set on the PR head, including container builds.

The M09 progress gate includes an isolated M08-to-M09 upgrade test: legacy dates
are explicitly UTC, history is preserved, active minutes are never fabricated,
and review updates remain forbidden. Tests use explicit UTC instants for midnight,
DST and weekly boundaries. They cover current-source validation, foreign issue/card
IDs, insufficient history, stale versions, atomic active-plan replacement,
concurrent refresh/accept/skip/events, account deletion, source deletion/rebuild,
partial multi-card review completion and profile/session lock ordering.

CI adds `test:integration:plans`, `test:integration:progress`, and
`test:e2e:progress`, using PostgreSQL/Redis and fake text, speech and plan providers.
All previous required gates remain in the workflow. A model-backed plans eval
suite is inapplicable: `plan-generator-v1` makes no model call. Its selection and
reference invariants are covered by deterministic unit/integration tests.

Manual validation remains: real local Ollama/whisper availability, correction
quality, physical microphone/browser playback, active typing behavior on target
devices and Spanish recommendation usability. No live-quality, assessed CEFR,
psychological-trait, pronunciation, fluency-score or scientifically validated
progress claim is made. M10/M11 are not implemented. The PR must not be merged
by the implementing agent.
