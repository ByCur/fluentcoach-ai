# Roadmap validation

Validated locally on 2026-10-06, based on latest fetched main `10d5789`.
Node 20.20.0 / pnpm 10.28.1, real local PostgreSQL and Redis, isolated synthetic
learners and browser test database. No paid provider calls or deployment.

| Gate | Result |
| --- | --- |
| Frozen dependency install, full lint, full typecheck, workspace build | Passed |
| `pnpm exec vitest run` | 76 files, 438 tests passed |
| `pnpm exec playwright test` | Full Chromium suite: 41 passed |
| Final `pnpm test:e2e:progress` after navigation cancellation fix | 14 passed, including the additional navigation regression |
| Final affected lint, web build/typecheck and root TypeScript check | Passed |
| Prisma schema validation, Compose configuration, forward migrations | Passed; both local test databases upgraded |
| `pnpm eval:ai -- --suite plans --billing-mode free_only` | 6 synthetic cases + 4 adversarial fallback checks passed |
| `pnpm eval:ai -- --suite pilot-text --billing-mode free_only` | 112/112 synthetic cases, 336 fake calls passed |
| Desktop and 360px mobile visual inspection | Passed; prominent current action, readable timeline, no horizontal scrolling |

The complete Vitest run covers units, architecture boundaries, identity,
sessions, AI/voice contracts, jobs/resilience, analysis, issues, reviews, plans,
progress, privacy, load, migration, deployment/release and container smoke tests.
The additive migration test upgrades populated legacy plans, preserving IDs,
definitions, completed states and their old order. Two-account tests retain
ownership, CSRF and strict request validation. Deletion during roadmap inference
revokes without waiting for the provider or recreating account state.

The browser checks cover automatic onboarding creation, interest ordering,
starting/finishing/advancing the current conversation, transcript reload/resume,
recurring issue adaptation, bounded vocabulary reviews, duplicate clicks,
lost acknowledgements, inline creation/hydration errors, actual local Ollama
outage, mobile layout, profile navigation, privacy/export/deletion, microphone
cleanup and supported axe accessibility checks. Across the full run and final
roadmap run, all 42 distinct browser cases passed. The final navigation test
reproduced a delayed response reopening practice over Mi perfil before the fix;
after cancellation on unmount it preserves the destination and later resumes the
same committed session. The voice mute test now waits for canonical turn
reconciliation before unmuting; its playback/cancellation assertions remain.

The startup root cause was independently reproduced before implementation:
the first start committed one linked session and increased the plan version;
retrying the original version failed with `STALE_PLAN_VERSION`. The E2E
regression now drops the committed response, retries the original version and
asserts exactly one session and the same activity. PostgreSQL concurrency tests
also enforce one active route and one linked session.

These results verify technical behavior with synthetic data. Live Ollama tutor
quality, educational usefulness for the learner, physical microphones/TTS and
manual screen-reader checks remain manual validation. Automated accessibility
is not WCAG certification. Existing cloud hosting/private-pilot gates remain as
documented in the release runbook. No thresholds, privacy fences or CI gates
were disabled.

## PR #31 CI synchronization follow-up

CI's scenario read raced the asynchronous canonical-session lookup when opening
Práctica libre. The conversation helper now waits for the Situación combobox to
be visible and enabled before reading its exact fourteen values, with no sleeps
or application changes. The tests also read each A1/A2/B1/B2 session snapshot back
from the owned session API and verify its new EventSource request uses cursor 0.
Free practice after onboarding and reload remains covered.

Revalidated: `pnpm test:e2e:conversation` (2 passed), `pnpm test:e2e:progress`
(14 passed, including roadmap/provider/navigation), affected ESLint and root
TypeScript checks (passed). The product's asynchronous session lookup is preserved.

## Persistent-account startup and tutor opening regression

See ADR 0021. Reproduce with five owned unfinished sessions: the exact rejection
is `409 / OPEN_SESSION_LIMIT`, not a stale plan version. New regressions cover five
empty CREATED practices, account isolation, retained meaningful CREATED/ACTIVE
practices and live leases, concurrent starts, receipt replay, opener persistence,
concurrent workers, failure fallback and absence of learner evidence. Browser tests
cover the current CTA error location, bounded conflict retries, empty learner-start,
opening status, speech playback and reload without another opener request.

`pnpm eval:ai -- --suite tutor-openings --billing-mode free_only` runs the versioned
56-case structural scenario/level matrix with fake AI. Optional `--live --max-calls
6 --output /tmp/tutor-openings.json` allows at most six local Ollama calls and zero
paid calls. Review English, scenario relevance and difficulty in the live artifact;
fake output and prompt contract checks do not establish local model quality.

Workspace verification for this change: all Vitest projects passed (458 tests),
and the subsequently added cleanup/lease race passed in the complete 16-test
roadmap file. The complete browser collection and final affected-file rerun
verified all 51 current scenarios, including a11y, learner/tutor-start report evidence and normal progress and
voice preferences. Lint, typecheck, workspace build, forward migration deployment,
release preflight and all three fake evaluation suites passed. The local Ollama
adapter was checked with normalized response fixtures and an actual HTTP outage;
a running local model was unavailable, so live wording quality is unverified.
