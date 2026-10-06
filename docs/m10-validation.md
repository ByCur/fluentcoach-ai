# M10 synthetic validation

Implementation ready for technical review. Base: latest main
`62df476f18d293e8c654acc116ea72d7953485f1`; branch:
`feat/m10-privacy-hardening`. Exercised on 2026-10-06 with Node 20.20.2,
pnpm 10.28.1, PostgreSQL 17, Redis 8, synthetic fixtures and fake AI/speech in
`BILLING_MODE=free_only`. Integration/browser databases were isolated from the
developer's normal database. No paid calls or cloud resources were used.

## Executed commands and counts

| Command | Local result |
| --- | --- |
| `pnpm lint` / `pnpm typecheck` / `pnpm build` | All passed |
| `pnpm test:unit` | 165 passed, including 4 UTC retention boundary tests |
| `pnpm test:boundaries` | 2 passed |
| `pnpm db:migrate:test` | All 10 migrations applied to empty isolated DB |
| `pnpm test:integration:privacy` | 29 passed: lifecycle, HTTP and M09 upgrade |
| `pnpm test:security` | History, production audit and 3 image gates passed |
| `pnpm test:a11y` | 3 passed; zero serious/critical supported violations |
| `pnpm test:load` | 2 passed; each exercises 5 concurrent sessions |
| `pnpm test:resilience` | 87 passed across 9 files; overlaps privacy/contracts |
| `pnpm test:integration:identity` | 20 passed |
| `pnpm test:integration:sessions` | 12 passed |
| `pnpm test:integration:jobs` | 7 passed |
| `pnpm test:integration:analysis` | 18 passed |
| `pnpm test:integration:issues` | 19 passed |
| `pnpm test:integration:reviews` | 13 passed |
| `pnpm test:integration:plans` | 26 passed |
| `pnpm test:integration:progress` | 23 passed |
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
| `pnpm eval:ai -- --suite pilot-text --billing-mode free_only` | 48/48 synthetic cases, 144 fake calls |
| Prisma schema validation | Passed |
| `PRIVACY_DRILL_DISPOSABLE=1 pnpm drill:restore` | Actual backup/restore passed |

Vitest/Playwright fail if no tests are collected; no empty suite is counted as
passed. Regression assertions remain. Tests respect irreversible deletion,
provider calls outside account locks and per-account open-session capacity.
Voice browser tests own separate synthetic learners; reloads retain the same
account and voice preferences within a test.

## Security and runtime

Gitleaks **8.24.3**, redacted `git --all` history: no findings. Trivy **0.75.0**:
each built API/web/worker image has **0 fixable HIGH/CRITICAL** runtime findings.
Production pnpm audit: **0 HIGH, 0 CRITICAL, 4 MODERATE, 1 LOW**. No advisory/CVE
exceptions are configured. This does not claim zero total vulnerabilities or
absence of findings without available fixes.

All final runtime images started locally. API/worker readiness and web liveness
returned 200; web forwarded an unauthenticated API request and returned the
expected 401. Identities: node uid 1000 for API/worker; nginx uid 101 for web.
The separate non-root migration image applied all 10 migrations successfully.
Environment files/proxy CA are excluded from image layers; API/worker deployment
contains production dependencies and excludes development tooling.

## Five-session load and resilience

| Synthetic scenario | Requests/operations | Total ms | p50 ms | p95 ms | Errors |
| --- | --- | --- | --- | --- | --- |
| Authenticated HTTP, text/voice, durable reports/progress | 62 | 14,116.81 | 7.75 | 3,738.85 | 0 |
| Application ports, transcript/events/reports/progress | 46 | 984.02 | 57.15 | 259.66 | 0 |

Measurements include reconciliation/streaming waits and concurrent local checks.
No lost/duplicate turns, cross-session/account leakage, deadlocks, pool exhaustion
or unhandled 5xx occurred. Correctness is the gate; no arbitrary latency SLA.
This is local pilot sanity, not production scalability or real provider latency.

Resilience covers Ollama/whisper/Redis outages, timeout/invalid provider output,
bounded analysis exhaustion, signed/durable duplicates, restart/reconciliation,
deletion during blocked valid analysis and plan selection, export/retention
rollback retries and interrupted/idempotent replay. Canonical state survives;
late results cannot recreate learner data; failures do not fabricate success or
enable paid fallback. See the resilience playbook for operator recovery.

## Accessibility

`@axe-core/playwright` **4.10.2**, Chromium and supported WCAG 2/2.1/2.2 A/AA rules:
**3 tests passed**, zero serious/critical violations and no allowlists. Tested
onboarding, practice selection, text conversation, fake-media recording/stopping,
reports, issues, vocabulary/review, plans/progress and privacy/export/deletion.
Keyboard Tab/focus and deliberate disabled confirmation are checked. Visible
focus styling was extended to links; no detected axe violation was suppressed.
Device/screen-reader and complete keyboard review remain manual gates.

## Actual restore drill

```sh
DATABASE_URL=postgresql://fluentcoach:local-development-only@localhost:5432/fluentcoach_restore_test \
PRIVACY_DRILL_DISPOSABLE=1 pnpm drill:restore
```

The localhost `_test` selector and explicit flag authorize only generated
disposable DBs. Seed A/B with M07/M08/M09 history; actual `pg_dump --format=custom`;
delete A after backup; preserve a separate ledger; actual
`pg_restore --exit-on-error` into the isolated DB; apply current migrations;
replay twice; verify A absence, B history and readiness; remove generated
databases and temporary dump/ledger files. No traffic is switched.

Measured: **16,722.29 ms**, **126,670 backup bytes**, **2 replay passes**. A and
its derived state were absent, B history intact and `schemaReady()` true.
This is synthetic local recovery evidence, not production RPO/RTO or backup SLA.

## CI and remaining gates

The PR quality job retains all regressions and adds privacy, load, resilience,
Chromium accessibility and actual restore. The images job executes dependency,
history and runtime-image scanning. The PR checks provide the final head SHA,
CI run URL/status; local results alone do not mark M10 complete.

Before real-data pilot/M11: complete keyboard/focus and NVDA/VoiceOver review;
real microphone/mobile/zoom/contrast checks; local model/hardware quality and
latency review; OIDC recent authentication; independent protected tombstone
ledger/backup custody and expiry; production restore/readiness/privacy drill.
Independently verify optional remote-provider retention/deletion before sending
real learner data. No GDPR/WCAG certification or production readiness is claimed.

## Changed files

83 files changed in the focused M10 implementation:

```text
.github/workflows/ci.yml
.gitleaks.toml
.nvmrc
DOCUMENTATION.md
Dockerfile
PLAN.md
SPEC.md
apps/api/package.json
apps/api/src/ai.providers.ts
apps/api/src/api-exception.filter.ts
apps/api/src/app.module.ts
apps/api/src/job.controller.ts
apps/api/src/job.controller.unit.test.ts
apps/api/src/main.ts
apps/api/src/privacy-reconciler.ts
apps/api/src/privacy.controller.ts
apps/api/src/security.ts
apps/api/src/session.ts
apps/web/package.json
apps/web/src/main.tsx
apps/web/src/privacy-panel.tsx
apps/web/src/report-panel.tsx
apps/web/src/styles.css
compose.yaml
docs/adr/0015-deletion-epochs-and-tombstone-replay.md
docs/adr/0016-ninety-day-source-retention.md
docs/m10-accessibility.md
docs/m10-data-lifecycle.md
docs/m10-load-and-resilience.md
docs/m10-privacy-lifecycle.md
docs/m10-restore-runbook.md
docs/m10-security-policy.md
docs/m10-validation.md
infra/nginx.conf
package.json
packages/application/src/ai.ts
packages/application/src/conversation.ts
packages/application/src/index.ts
packages/application/src/jobs.ts
packages/application/src/plans.ts
packages/application/src/privacy.ts
packages/application/src/speech.ts
packages/application/src/telemetry.ts
packages/application/src/voice-turn.ts
packages/contracts/package.json
packages/contracts/src/index.ts
packages/domain/src/index.ts
packages/domain/src/operational-limits.ts
packages/domain/src/privacy.ts
packages/domain/src/privacy.unit.test.ts
packages/infrastructure/prisma/migrations/202610060001_m10_privacy/migration.sql
packages/infrastructure/prisma/schema.prisma
packages/infrastructure/src/index.ts
packages/infrastructure/src/job-repository.ts
packages/infrastructure/src/ollama-text.ts
packages/infrastructure/src/plan-progress-repository.ts
packages/infrastructure/src/privacy-repository.ts
packages/infrastructure/src/report-repository.ts
packages/infrastructure/src/schema-readiness.ts
packages/infrastructure/src/session-repository.ts
packages/infrastructure/src/telemetry.ts
playwright.config.ts
pnpm-lock.yaml
scripts/drill-restore.ts
scripts/install-security-scanners.sh
scripts/privacy-tombstones.ts
scripts/security-scan.ts
scripts/smoke-ollama.ts
scripts/smoke-whisper.ts
tests/e2e/a11y.spec.ts
tests/e2e/voice.spec.ts
tests/integration/analysis.test.ts
tests/integration/plans-additional.test.ts
tests/integration/privacy-http.test.ts
tests/integration/privacy-migration.test.ts
tests/integration/privacy.test.ts
tests/integration/sessions.test.ts
tests/load/http-pilot.test.ts
tests/load/pilot.test.ts
tests/resilience/privacy-providers.test.ts
tests/smoke/containers.test.ts
tests/support/database.ts
vitest.config.ts
```
