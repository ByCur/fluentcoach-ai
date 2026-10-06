# M11 validation and release status

Status: implementation under technical review; **M11 incomplete / cloud release
blocked**. Based on latest fetched main `c3413e49e2266e1907d14cd21c660ccbe9a13834`.
All local data below are synthetic, with fake AI/speech and real local PostgreSQL
17.6/Redis 8.2.1. Node 20.20.0 and pnpm 10.28.1; no provider billing, Gemini calls,
cloud resource, deployed worker or public developer-PC endpoint.

## Local validation (2026-10-06)

| Gate | Local result |
| --- | --- |
| Frozen dependency install, lint, typecheck, workspace build, Prisma validation | Passed |
| `test:migrations` | 7 passed, populated previous-schema upgrades included |
| `release:preflight` | Repository passed; deployment explicitly blocked |
| `test:deployment` | 5 passed, actual canary browser build and production refusal included |
| `test:release` | 10 passed, real PostgreSQL/Redis recovery and synthetic OCI archive identity/tamper checks included |
| Unit / architecture boundaries | 166 / 2 passed |
| Identity / sessions / jobs / analysis | 20 / 12 / 7 / 18 passed |
| Issues / reviews / plans / progress / privacy | 19 / 13 / 26 / 23 / 29 passed |
| AI / voice contracts; job resilience | 36 / 7; 15 passed |
| Combined resilience / load | 87 / 2 passed; synthetic five-session load |
| `eval:ai -- --suite pilot-text --billing-mode free_only` | 48/48 synthetic cases, 144 fake calls; no live-model inference |
| `test:e2e:cold-start` | 2 passed; startup HTML/503, lost acknowledgement and actual aborted SSE recovery |
| Full Chromium browser regression, including axe and voice | 26 passed; all previous browser scenarios plus M11 cold-start tests |
| Operator migration / drain / status / resume | Passed on explicit isolated `_test` DB; admission resumed and all session/lease counts zero |
| Container configuration / smoke | Compose configuration and actual healthy local stack passed; 3 smoke checks passed |
| `drill:restore` | Passed: actual pg_dump/pg_restore, independent synthetic ledger replay twice, deleted A absent, B preserved, schema ready |
| Gitleaks / production dependency / runtime image security | Passed: no secrets; 0 high/critical dependencies and 0 fixable high/critical findings in API/web/worker images; dependency audit retains 4 moderate and 1 low findings |

The restore rehearsal measured 69,014 ms and a 129,875-byte dump; this is local
synthetic evidence, not production RTO/RPO. Earlier resource-contended runs were
not counted as passes: the issues gate was rerun successfully, and browser login
helpers were corrected to wait for asynchronous readiness rather than skip login.
No thresholds, assertions, scanners or required CI gates were disabled.

Local Docker health checks needed an execution-only override disabling the
inherited HTTP proxy for loopback BusyBox wget; external proxy and CA trust stayed
enabled. This override is not a hosting configuration change. Existing Compose's
worker remains local test infrastructure, never a deployed cloud worker.

GitHub PR CI is pending at PR creation; local success is not a GitHub CI or release
pass. All earlier CI commands remain, and all five requested M11 commands are
added. CI OCI artifact export is pending with GitHub CI; the local OCI test uses
a synthetic archive and verifies forged identity/tampering refusal. Real previous
immutable container rollback remains a manual gate; SQL
compatibility and OCI identity tests alone do not prove that deployment operation.

## Environment and milestone exit gates

Staging: **not contacted / not deployed / no pass**.
Production: **not contacted / not deployed / no pass / not authorized**.
Real learner pilot: **not run**.
Voice: local composed implementation preserved; real hosted voice is **blocked**,
not proven by fake/browser checks. Default hosted text inference is also blocked.
Repository preflight intentionally reports blocked deployment. Production release
check/startup rejects the current candidate even with an approval record.

Current provider claims and caveats are in [dated verification](m11-provider-verification.md).
Render/Neon/Upstash/Auth0 public official docs were contacted, not their resource
APIs or actual tenants. Genuine tenant/free-only/security/region/retention gates
remain open. No default provider or EUR 0/free-only policy was weakened.

Manual blockers: secure zero-cost local AI/voice hosting, Redis Free at-rest
protection, independent encrypted current tombstone ledger/backup destinations,
actual previous immutable image rollback on forward schema, actual staging/prod
smoke, Auth0 invitation/recent-auth config, real models/device/screen-reader
checks, privacy/region/consent review and named operator authorization. See
[ADR 0017](adr/0017-m11-blocked-zero-cost-release.md) and
[pilot checklist](m11-pilot-checklist.md).
