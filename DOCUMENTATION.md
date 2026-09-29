# FluentCoach AI — Engineering and operations handbook

## Status and document map

M00 architecture/decisions and M01 are complete; M00 live feasibility is formally
deferred to M05/M06 entry gates. The repository has pinned executable tooling,
web/API/worker shells, PostgreSQL and Redis development services, validated
server configuration, health/readiness endpoints, container builds, CI, and
foundation tests. Product behavior and persistence remain intentionally absent.

M00 selected configurable OpenAI Responses/`gpt-5.6-terra` as the quality-first
text candidate and `gpt-realtime-2.1-mini` as the cost-efficient voice candidate,
behind application ports and a deterministic fake. It selected browser-to-provider
WebRTC with an API sideband, Auth0 EU OIDC, and Render Frankfurt. ADRs 0002–0004
contain the rationale, diagrams, privacy/device limits, budget, evidence and
live-validation gates. No provider or hosting resource has been provisioned.

- `SPEC.md`: requirements, decisions, architecture and data model.
- `PLAN.md`: milestone scope, acceptance and validation gates.
- `AGENTS.md`: contributor/agent rules.
- `README.md`: tested M01 quick start and quality gates.
- `docs/adr/`: accepted implementation decisions and review triggers.

## Development workflow

Deliver one coherent milestone slice per review. Product rules belong in pure
domain/application code, transport in apps, SDK/ORM dependencies in adapters.
Trace behavior to SPEC.md requirements and update documents when decisions change.

## M00 operational envelope

- Normal development/CI uses deterministic synthetic AI and costs $0. Paid text
  evaluations are capped at $10/run, voice spikes at $5/run, and all require
  owner approval. Development AI has a $20/month provider ceiling.
- The one-user pilot estimate is $30/month fixed infrastructure plus $6/month AI.
  Enforce a $10/month application AI stop and a $50/month total approval ceiling;
  re-quote every service before purchase.
- Voice sessions are initially capped at 15 minutes. Short-lived browser material
  and the API sideband replace exposure of a standard provider key. Text remains
  available when voice permission, connection, reconnect, or compatibility fails.
- Target devices are modern iPhone/iPad Safari, Android Chrome and desktop
  Chrome/Edge. This is not physical validation; M06 owns the recorded device run.
- Store no audio by default. Application transcripts/reports target 90 days;
  provider retention, EU processing, DPAs, learner adulthood/consent, actual
  devices and backup/deletion behavior remain real-data release gates.
- Send ordinary Responses tutoring and analysis requests with `store: false`.
  This disables provider-side response-state storage; it neither changes the
  application's retention policy nor by itself eliminates provider abuse-monitoring
  retention. ZDR/MAM eligibility remains a separately verified pilot gate.

M00's network research command was blocked by the execution proxy (HTTP 403), and
no credentials were available. Accordingly, the credentialed synthetic WebRTC,
structured-output procedure in ADR 0002 must run at the M05 entry gate and the
WebRTC latency/cost procedure must run at the M06 entry gate;
provider/privacy terms must be verified before any real learner data. These
limitations do not block M02's synthetic account/profile implementation.

M01 pins a supported Node.js release and pnpm after compatibility checks, commits
the lockfile, and adds Docker Compose for web/API/worker/PostgreSQL/Redis. Provide
health checks and persistent local volumes. Allow host-run apps against container
dependencies for debugging. Document Windows PowerShell commands and exact
host/container context. Use synthetic seeds, never production data or credentials.

M01 fresh-clone setup (PowerShell; macOS/Linux equivalents are in `README.md`):

```powershell
Copy-Item .env.example .env
# Fill local placeholders documented in the future README.
pnpm install --frozen-lockfile
docker compose config --quiet
docker compose up --build -d
pnpm test:smoke
```

M01 has no owned database entities, so it deliberately has no empty migration or
seed. Prisma migration commands become executable when M02 introduces the first
schema. API/worker readiness currently verifies PostgreSQL and Redis connectivity;
it must add schema compatibility once migrations exist. Compose values are local
development placeholders only, and host-run apps use the ignored `.env` file.

The future setup must hold application readiness until migrations complete.
Seeds are idempotent; fake AI supports normal development without paid keys.
Do not make destructive volume resets part of ordinary setup.

| Planned script | Contract |
| --- | --- |
| `pnpm dev` | Host web/API/worker against documented local dependencies |
| `pnpm lint` / `pnpm typecheck` | Static quality, boundary rules, strict typing |
| `pnpm test:unit` | Deterministic domain/application tests |
| `pnpm test:integration` | All implemented real DB/queue/API suites (introduced with later milestones) |
| `pnpm test:contract:ai` | Normalized adapter contracts and fixtures |
| `pnpm test:e2e` | Critical browser flows with fake AI |
| `pnpm build` | Build all packages/apps |
| `pnpm db:migrate:dev` | Apply local migrations in documented context |
| `pnpm db:migrate:deploy` | Apply committed migrations as controlled release job |
| `pnpm test:migrations` | Empty DB and previous-release upgrade checks |
| `pnpm eval:ai` / `pnpm eval:voice` | Opt-in, budgeted live evaluations |

Add PLAN.md specialized scripts when their real tests exist. Required suites
fail on missing fixtures, unavailable services, failed assertions or zero tests.

M01 implements `lint`, `typecheck`, `test:unit`, `test:boundaries`, `test:smoke`,
and `build`. The smoke suite checks the image/Compose contract, while Compose's
five health checks validate running containers in Docker-capable environments.
CI runs both and builds each image target. The API distinguishes process liveness
from dependency readiness and returns a content-free 503 when a dependency fails.

## Configuration and secrets

Define typed startup configuration for environment/public origin, DB/Redis URLs,
OIDC issuer/audience, server-session secret, adapter/model IDs, AI key, deadlines,
duration/concurrency/spend caps, telemetry, retention and feature flags.

Browser config is an explicit public allowlist. DB URLs, permanent AI keys,
identity/session secrets and telemetry credentials remain server-side. Media
credentials are short-lived and scoped. Redact validation errors/connection URLs.
Production secrets use the hosting secret store with rotation; local `.env` is
ignored. Reject fake AI and development auth bypasses in production. Ordinary CI
must not need provider secrets.

## Testing strategy

| Layer | Purpose | Examples/dependencies |
| --- | --- | --- |
| Unit | Deterministic product invariants | Fake clock/provider; modes, state machine, scheduling, streaks |
| Integration | Real persistence/consistency | PostgreSQL/Redis; constraints, ownership, outbox, crash/retry, deletion races |
| Contract | Adapter semantics | Synthetic normalized events; schema failure, cancellation, usage, unsupported features |
| API/security | Identity at every entry point | Two accounts, guessed IDs, CSRF, token expiry, exports/streams/media limits |
| Browser | Complete learner workflows | Playwright + fake AI/audio; onboarding, help, modes, report retry, reviews, keyboard |
| Resilience/load | Recovery and target evidence | Worker/Redis failure, provider timeout/429, reconnect, five sessions, restore |
| AI/voice evaluation | Real educational/device quality | Versioned synthetic examples, human rubric, actual device checklist, cost cap |

Test behavior and invariants rather than implementation-shaped snapshots or an
arbitrary global coverage quota. Do not mock PostgreSQL to claim transactional
correctness. Isolate test databases/queue keys, bound waits and clean up fixtures.
Use fixed clocks for calendar rules; investigate flaky tests rather than masking
them with retries.

Initial live evaluation set: at least 48 short fixtures, six scenarios × four
levels × two modes, plus help, silence, ambiguous transcripts, prompt injection,
invalid outputs and provider failures. Specify expected behavior rather than
exact prose. Review level suitability, correction correctness/timing, tone and
help recovery. Proposed gate: all outputs parse and pass evidence checks, no
fabricated evidence/critical unsafe instructions, and at least 90% pass the
reviewed teaching rubric. Evaluate each core fixture three times for a provider/
prompt change; record variability, reviewer, model/prompt/schema versions. If
the cost limit prevents completion, report incomplete, not passed.

Voice evaluation adds permissions/playback, turn boundaries, interruption, Spanish
help, reconnect, noise and speech pace on supported devices. Measure latency
without retaining learner audio. Fake-provider checks do not prove live quality.
Real learner recordings are not fixtures without separate explicit consent and
retention rules. Do not claim calibrated CEFR or pronunciation assessment.

## CI/CD and release

Proposed GitHub Actions pipeline, subject to the eventual repository host:

1. Frozen install, lint/boundaries, types, unit tests, secret/dependency scanning.
2. Isolated PostgreSQL/Redis, migrations, integration/contracts and critical E2E
   using synthetic data and fake AI.
3. Build non-root application images, scan and publish immutable commit-tagged
   artifacts from trusted branches. Untrusted PRs receive no secrets.
4. Auto-deploy staging after main passes: one migration job, readiness then smoke.
5. Promote the same digest to production through an explicit release gate;
   compatible migration/API/worker rollout and post-deploy smoke.

Paid live evaluations are manual or explicitly budgeted, never untrusted-PR jobs.
Provider/prompt/schema changes require reviewed evaluation evidence for release.
Record configuration/migration risks, checks and rollback instructions.

## Deployment and migrations

Initial topology: managed EU-region containers, static web/HTTPS proxy, API,
continuously running worker, private managed PostgreSQL/Redis. Use same-origin
API routing. Select vendor only after M00 budget, long-lived connection, worker,
region and data-processing checks. No Kubernetes/service mesh initially.

Local/staging/prod use independent credentials, queues, databases and AI budgets.
Do not expose data services to browsers. Deployed microphone access requires
HTTPS, as described by [MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).

Use expand/contract migrations: add compatible fields, deploy compatible readers/
writers, backfill observably, remove obsolete fields in a later release. A single
locked release job migrates; replicas never race schema changes. Roll back a
compatible image first. Destructive changes need forward repair or tested restore;
reversing a schema migration does not recover deleted data.

Drain API sessions during releases within platform shutdown limits; clearly end
connections that cannot survive. Workers finish or release leases for retry.
Version job envelopes and retain rolling-release compatibility. Rehearse releases
with active synthetic sessions.

## Observability and operating playbooks

Correlate requests, sessions, analysis and provider runs. Avoid account IDs as
high-cardinality metric labels. Log kinds, durations, outcomes and error codes,
never raw transcripts/prompts/credentials. Limit telemetry access and retention.

Dashboard: API latency/errors, text/voice latency, disconnects, active sessions,
oldest job, retry/failure counts, report latency, rejected outputs, provider
throttling and estimated spend. Initial alerts: analysis older than five minutes,
sustained provider failures, 80% of configured budget and exhausted budget.
Assign an owner/action and tune against observations; prices are not hardcoded.

Playbooks required before pilot:

- **Provider outage:** bounded retries, visible failure or available text fallback,
  preserved history and independently retryable reports; no fabricated success.
- **Queue outage:** inspect persisted outbox/run state, restore Redis/worker,
  reconcile and verify idempotent effects. See [BullMQ guidance](https://docs.bullmq.io/patterns/idempotent-jobs).
- **Bad analysis:** reject/quarantine invalid output, retain safe diagnostics,
  reproduce synthetically, version fixes and reanalyze without double counting.
- **Credential exposure:** revoke/rotate, invalidate affected sessions, review
  usage/access, redeploy and verify.
- **Restore:** restore in isolation, replay deletion tombstones, verify schema,
  ownership and synthetic workflow, then switch traffic. Record actual RPO/RTO.
- **Deletion/retention:** revoke access first, terminate provider sessions, cancel
  jobs and check deletion epoch before commits; purge raw/derived records and
  exports. Keep minimal content-free tombstones for restore; honor separately
  confirmed backup and provider windows.

## Documentation maintenance

ADRs contain context, options, decision, consequences, evidence and review trigger.
First ADRs cover stack/provider/voice, identity/ownership, retention, background
delivery and deployment. Keep OpenAPI, diagrams, migration instructions and tested
setup current. Each milestone note records exact checks, results, limitations and
remaining assumptions. Distinguish proposed targets from measured results.
