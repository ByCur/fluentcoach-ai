# FluentCoach AI — Engineering and operations handbook

## Status and document map

M00 architecture/decisions, as amended by ADR 0005, and M01 are complete; live
feasibility is formally deferred to M05/M06 entry gates. The repository has
pinned executable tooling,
web/API/worker shells, PostgreSQL and Redis development services, validated
server configuration, health/readiness endpoints, container builds, CI, and
foundation tests. Identity/onboarding, deterministic text sessions and durable
jobs are implemented; M05 adds synthetic-tested text AI and reports. Its live
entry gate remains pending and no live Gemini quality is claimed.

ADR 0010 and ADR 0011 select local Ollama text and composed turn-based voice as the normal **EUR 0 recurring API cost** path. ADR 0005 originally selected Render Static Site Free,
Render Free Web Service, Neon PostgreSQL Free, Upstash Redis Free, Upstash QStash
Free, conditional Auth0 Free, and Gemini Developer API Free. Configurable
Gemini text and Live are retained only as future explicit candidates; neither is required or an automatic fallback. Local Ollama `llama3.2:3b`, whisper.cpp, and browser speech synthesis are the defaults;
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
- Voice uses one bounded authenticated audio upload at a time, local whisper.cpp transcription, the existing Ollama tutor path, and optional browser speech synthesis. It is not continuous/full-duplex. Browser TTS has no FluentCoach API charge but is not guaranteed offline. See [Windows host setup](docs/local-whisper-windows.md).
- Store no raw audio. **Gemini's unpaid Developer API terms currently say submitted
  content may improve Google products and may be human-reviewed.** This provider
  policy is separate from FluentCoach's 90-day transcript/report retention and
  deletion. Real use requires a plain, versioned disclosure and explicit consent.
- Current free-limit planning snapshots and fail-closed behavior are in ADR 0005:
  Render's 750 hours/cold starts, Neon compute/storage, Upstash Redis/QStash,
  Auth0 feature/MAU and model-specific Gemini limits all require dated re-checks.
- Target devices remain modern iPhone/iPad Safari, Android Chrome and desktop
  Chrome/Edge. M06 owns physical validation and model-lifecycle evidence.

M00's network research command was blocked by the execution proxy (HTTP 403), and
no credentials were available. Accordingly, the credentialed synthetic
structured-output procedure must run at the M05 entry gate, and the local whisper.cpp host/device procedure must run at the M06A entry gate;
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

## M02 implementation note (2026-09-29)

M02 introduces Prisma migrations for account identity, one learner profile per account, one current practice goal per account, and historical versioned consent. PostgreSQL remains canonical; Redis contains expiring opaque sessions and one-time OIDC state only. Compose applies committed Prisma migrations before API startup, and readiness verifies the completed migration plus required M02 columns. The test reset applies the same committed migration SQL to an empty isolated database. API ownership comes solely from the authenticated session, mutations require CSRF plus Origin validation, and disabled accounts invalidate access. See ADR 0006 for the identity/session boundary and Auth0 Free manual-user boundary and remaining live tenant gate, and ADR 0007 for the explicit decision to defer RLS until separate non-owner runtime/migration roles and transaction context can be proven.

The UI is Spanish-first, responsive and keyboard accessible, with profile, self-selected A1–B2 level, IANA timezone, interests, editable 10-minute/three-day goal, and explicit Gemini Free disclosure. No Gemini request or conversation feature exists in M02. `BILLING_MODE=free_only` is runtime validated; no paid fallback exists.


## M05 implementation and validation note (2026-09-30)

See ADR 0009 for the text/report decision and README for executable setup/eval
commands. M05 remains in progress: the credentialed entry gate and human-reviewed
live level/mode/scenario rubric have not run. The managed environment reports no
configured provider secret or approval; `eval:ai ... --live` exits before network
work with `Invalid AI configuration field: AI_FREE_TIER_APPROVED`.

Validated with Node 20.20.0 and pnpm 10.28.1, synthetic fixtures and real local
PostgreSQL 17.6/Redis 8.2.1:

| Checks | Result |
| --- | --- |
| `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm build` | Passed; typecheck now also covers root tests/eval tooling. |
| `pnpm test:unit`, `pnpm test:boundaries` | 45 and 2 tests passed. |
| `pnpm db:migrate:test`, Prisma schema validation | Four migrations applied; schema valid. |
| `pnpm test:integration:identity`, `pnpm test:integration:sessions`, `pnpm test:integration:jobs` | Existing 16, 1 and 2 tests passed unchanged. |
| `pnpm test:contract:ai`, `pnpm test:integration:analysis` | 25 contracts and 15 real PostgreSQL/HTTP/upgrade tests passed. |
| `pnpm test:resilience:jobs`, `pnpm test:smoke` | Existing 1 and 3 tests passed unchanged. |
| Onboarding, conversation and report Playwright suites | All 7 browser tests passed, including five report/recovery flows. |
| `pnpm eval:ai -- --suite pilot-text --billing-mode free_only` | All 48 fake level/mode/scenario cases passed policy/evidence checks, including help; human live review pending. |
| Live eval with `--live` | Blocked before any provider call; no live validation claimed. |
| Container configuration, API/worker/web images and runtime readiness | Passed with the cloud harness adjustments described below. |

The cloud run needed `NODE_OPTIONS=--max-old-space-size=6144` for typed ESLint.
Browser installation succeeded without the privileged dependency installer;
Chromium's required libraries were already present and the actual browser tests
passed. Docker builds used a temporary Dockerfile with the provided CA mounted
only as a BuildKit secret. Temporary Compose overrides selected those images and
added `wget -Y off` only to loopback health probes: inherited cloud proxy settings
otherwise returned HTTP 403 for localhost. All five service health checks then
passed and migration deployment exited successfully. The committed Dockerfile,
Compose health checks and existing tests were not weakened or replaced.

No live provider call, paid fallback, voice implementation, real-data pilot,
merge or pull request was performed. Synthetic eval output stays outside Git.


## M05 validation after M03/M04 hardening (2026-09-30)

Updated the existing M05 branch with `origin/main` at `56ab501` (PR #12).
All M03/M04 tests are unchanged from that main revision. M05 reports now use its
immutable revision snapshots; see ADR 0009 for the compatibility migration and
preserved provider audit history. New regressions cover late revision reports,
partial terminal sessions and both migration application orders.

Revalidated with Node 20.20.0, pnpm 10.28.1, isolated synthetic PostgreSQL
17.6/Redis 8.2.1 and deterministic fake AI:

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm build` | Passed; lint uses the explicit 6 GiB heap budget. |
| `pnpm test:unit`, `pnpm test:boundaries` | 55 and 2 passed. |
| `pnpm db:migrate:test`, Prisma schema validation | Six migrations applied; schema valid. |
| `pnpm test:integration:identity`, `pnpm test:integration:sessions` | 16 and 7 passed. |
| `pnpm test:contract:ai` | 25 passed. |
| `pnpm test:integration:jobs`, `pnpm test:resilience:jobs` | 7 and 8 passed. |
| `pnpm test:integration:analysis` | 18 passed, including upgrade and authenticated HTTP cases. |
| `pnpm test:e2e:onboarding`, `pnpm test:e2e:conversation`, `pnpm test:e2e:reports` | 1, 2 and 5 passed. |
| `pnpm test:smoke` | 3 passed. |
| `pnpm eval:ai -- --suite pilot-text --billing-mode free_only` | 48/48 cases and 144 synthetic fake calls; policy/evidence checks passed. |
| Live eval with `--live` | Blocked before network: `AI_FREE_TIER_APPROVED` unavailable. |
| Container configuration, API/worker/web builds, migration deployment and five health checks | Passed with the existing temporary cloud CA/proxy harness and an isolated database. |

Total: 149 passing tests, plus the 48-case fake eval. No gates were skipped or
weakened. CI stops application containers after their health checks and before
database gates so the automatic reconciler cannot claim test-owned jobs. The shared development database contained three orphaned synthetic
analysis outboxes from earlier testing; the hardening correctly rejected that
invalid upgrade. Container validation used a fresh isolated database, preserving
the shared database. Nonempty valid M04 and M05 upgrade paths passed the automated
migration tests. Cloud CA/proxy changes remain temporary and outside Git.

PR #13 was superseded by the merged local-text work. M06A now implements local composed turn voice; no Gemini Live validation is required or claimed.


## M06A local turn-based voice (2026-10-02)

The local voice defaults are `SPEECH_PROVIDER=whisper-cpp`, `WHISPER_BASE_URL=http://127.0.0.1:8080`, `WHISPER_LANGUAGE=auto`, and `WHISPER_TIMEOUT_MS=45000`. Start whisper-server with `--convert` and host ffmpeg for browser WebM/Opus. The API accepts one of WebM, Ogg, WAV, MP4/M4A, or MPEG audio. The 8 MiB server limit is the hard resource bound; the client enforces a 30-second UX limit and the API validates its declared duration only as an untrusted additional hint. Raw audio is neither persisted nor logged.

Use `pnpm smoke:whisper -- <local-audio-file>` only on a host where whisper.cpp, ffmpeg, and an explicitly selected model are already installed. Normal CI uses fake audio, transcription, conversation, and TTS and makes no Ollama/Whisper/ffmpeg/microphone calls.


### M06A validation note

The PR quality workflow runs `pnpm lint`, `pnpm typecheck`, unit/boundary/build gates, the 32-test text AI contract suite, the separate 7-test voice contract suite, PostgreSQL-backed session/voice integration tests, and `pnpm test:e2e:voice` with fake AI, transcription, microphone, and TTS. Local targeted validation passed lint, the 61-test unit suite, 2 boundary tests, both contract suites, and the API build. PostgreSQL-backed session/voice API tests and Playwright still require the CI service harness because `DATABASE_URL`, Redis, and Docker are unavailable in this workspace. The real `smoke:whisper` command was deliberately not run because no local whisper-server/model/ffmpeg host exists. These checks remain required before milestone completion; no physical-device, latency, live transcription, offline-TTS, or pronunciation claim is made.
