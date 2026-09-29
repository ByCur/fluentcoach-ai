# FluentCoach AI — Engineering and operations handbook

## Status and document map

M00 architecture/decisions, as amended by ADR 0005, and M01 are complete; live
feasibility is formally deferred to M05/M06 entry gates. The repository has
pinned executable tooling,
web/API/worker shells, PostgreSQL and Redis development services, validated
server configuration, health/readiness endpoints, container builds, CI, and
foundation tests. Product behavior and persistence remain intentionally absent.

ADR 0005 selects a strict **EUR 0/month** pilot: Render Static Site Free,
Render Free Web Service, Neon PostgreSQL Free, Upstash Redis Free, Upstash QStash
Free, conditional Auth0 Free, and Gemini Developer API Free. Configurable
`gemini-2.5-flash` (text/analysis) and
`gemini-2.5-flash-native-audio-preview-09-2025` (Live native audio) are candidates;
the deterministic fake remains normal development/CI. OpenAI and a dedicated
BullMQ worker are future non-default alternatives. No provider or hosting resource
has been provisioned, billing enabled, payment method supplied, or secret added.

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

- `BILLING_MODE=free_only` is mandatory in pilot production. Startup rejects
  billable providers/plans and paid fallback; quota exhaustion fails closed.
- Estimated owner operating cost is **EUR 0/month** for one invited learner. Free
  credits/trials do not qualify, and any future spend requires a new ADR and owner
  approval. Re-check all plan limits and terms immediately before deployment.
- Render API cold starts are accepted and shown as startup/reconnecting. No
  always-on worker is deployed; QStash invokes secure idempotent API endpoints,
  while PostgreSQL retains pending work and canonical learner state.
- Voice prefers a direct Gemini Live WebSocket using an API-minted ephemeral token
  only after M06 verifies official browser support and safe scope. Otherwise test
  a minimal secure API relay; if that does not fit free capacity, voice is
  unavailable and text is offered when its quota remains.
- Store no raw audio. **Gemini's unpaid Developer API terms currently say submitted
  content may improve Google products and may be human-reviewed.** This provider
  policy is separate from FluentCoach's 90-day transcript/report retention and
  deletion. Real use requires a plain, versioned disclosure and explicit consent.
- Current free-limit planning snapshots and fail-closed behavior are in ADR 0005:
  Render's 750 hours/cold starts, Neon compute/storage, Upstash Redis/QStash,
  Auth0 feature/MAU and model-specific Gemini limits all require dated re-checks.
- Target devices remain modern iPhone/iPad Safari, Android Chrome and desktop
  Chrome/Edge. M06 owns physical validation and preview-model lifecycle evidence.

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

Define typed startup configuration for environment/public origin, `BILLING_MODE`, DB/Redis URLs,
OIDC issuer/audience, server-session secret, adapter/model IDs, AI key, deadlines,
duration/concurrency/spend caps, telemetry, retention and feature flags.

Browser config is an explicit public allowlist. DB URLs, permanent AI keys,
identity/session secrets and telemetry credentials remain server-side. Media
credentials are short-lived and scoped. Redact validation errors/connection URLs.
Production secrets use the hosting secret store with rotation; local `.env` is
ignored. In production reject fake AI/development auth bypasses and, under
`free_only`, reject any billable provider/plan or paid fallback. Ordinary CI
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

Live evaluations are manual, synthetic, and restricted to verified free quota;
they are never untrusted-PR jobs. Paid evaluation is forbidden by the pilot
policy.
Provider/prompt/schema changes require reviewed evaluation evidence for release.
Record configuration/migration risks, checks and rollback instructions.

## Deployment and migrations

Initial pilot topology is Render Static Site Free plus one cold-starting Render
Free API, Neon PostgreSQL Free, Upstash Redis Free and QStash Free. There is no
deployed worker. QStash calls authenticated idempotent API job endpoints and a
PostgreSQL reconciler preserves pending work. Use same-origin routing where
possible; verify regions, data paths and every free-plan term before deployment.
No Kubernetes/service mesh or automatic paid upgrade is permitted.

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
- **QStash outage/quota:** keep outbox/analysis pending in PostgreSQL, show pending,
  reconcile later and verify idempotent effects; do not start a paid worker.
- **Redis outage:** preserve canonical PostgreSQL data; expire/recreate only
  non-canonical cache/session state and never infer learner-data loss.
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
