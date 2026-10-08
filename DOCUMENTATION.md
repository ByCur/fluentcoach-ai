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
- `docs/adr/`: implementation decisions, proposed future decisions and review triggers.
- [M12 discovery](docs/m12-discovery.md): future exam/sharing specs, gates and review record.

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
- Store no raw audio. Normal tutor/transcription inference uses local Ollama and
  whisper.cpp; no learner content is sent to Gemini by default. Browser TTS may
  use browser/system services and is not guaranteed offline. Optional explicit
  Gemini configuration requires reviewing its unpaid API data-use terms (model
  improvement and possible human review), a matching disclosure and consent.
  Provider terms are separate from FluentCoach transcript/report retention and
  deletion; there is no implicit Gemini fallback.
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

The UI is Spanish-first, responsive and keyboard accessible, with profile, self-selected A1–B2 level, IANA timezone, interests, editable 10-minute/three-day goal, and an explicit local-first privacy disclosure. New onboarding records the local-first tuple `local-ai-practice` / `privacy-2026-10-05` / `local-first-2026-10-05`. The exact legacy Gemini tuple remains accepted for historical client compatibility; old records remain unchanged and do not count as current local-first acceptance (see README). No Gemini request or conversation feature exists in M02. `BILLING_MODE=free_only` is runtime validated; no paid fallback exists.


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

The local voice defaults are `SPEECH_PROVIDER=whisper-cpp`, `WHISPER_BASE_URL=http://127.0.0.1:8080`, `WHISPER_LANGUAGE=auto`, and `WHISPER_TIMEOUT_MS=45000`. The initial host gate uses multilingual Whisper `base`, not `base.en`: practice is primarily English, but short Spanish help phrases such as “No entiendo” must also be transcribable. A multilingual `small` quality/latency comparison follows the first real smoke/device test rather than increasing the default now. Start whisper-server with `--convert` and host ffmpeg for browser WebM/Opus. The API accepts one of WebM, Ogg, WAV, MP4/M4A, or MPEG audio. The 8 MiB server limit is the hard resource bound; the client enforces a 30-second UX limit and the API validates its declared duration only as an untrusted additional hint. Raw audio is neither persisted nor logged.

Use `pnpm smoke:whisper -- <local-audio-file>` only on a host where whisper.cpp, ffmpeg, and an explicitly selected model are already installed. Normal CI uses fake audio, transcription, conversation, and TTS and makes no Ollama/Whisper/ffmpeg/microphone calls.


### Initial M06A PR validation note (historical)

The PR quality workflow runs `pnpm lint`, `pnpm typecheck`, unit/boundary/build gates, the 32-test text AI contract suite, the separate 7-test voice contract suite, PostgreSQL-backed session/voice integration tests, and `pnpm test:e2e:voice` with fake AI, transcription, microphone, and TTS. Local targeted validation passed lint, the 61-test unit suite, 2 boundary tests, both contract suites, and the API build. PostgreSQL-backed session/voice API tests and Playwright still require the CI service harness because `DATABASE_URL`, Redis, and Docker are unavailable in this workspace. The real `smoke:whisper` command was deliberately not run because no local whisper-server/model/ffmpeg host exists. These checks remain required before milestone completion; no physical-device, latency, live transcription, offline-TTS, or pronunciation claim is made.


### M06A polish and owner-reported host gate (2026-10-05)

The owner reports a successful Windows host gate using multilingual whisper.cpp
`base`, microphone WebM/Opus, Ollama `llama3.2:3b`, browser speechSynthesis and
spoken “No entiendo”, including the complete microphone-to-tutor-playback path.
This is owner-reported evidence, not a host run performed by the PR automation.

Text and voice POST responses now share persisted-session/SSE-cursor
reconciliation. Late deltas already included in that response are ignored;
streaming remains visible during generation. `tutor-v3` instructs explicit
Spanish help first, then one simpler English sentence/question, without grammar
correction of the help request. Normal practice remains English.

Browser English voice/rate controls persist locally, prefer local/enhanced
voices, handle `voiceschanged`, and fall back to the browser default when no
English voice is available. Mute/stop remain available. Onboarding now describes
the default local providers, no recurring AI API cost, no raw-audio persistence,
and browser TTS offline limits. No provider, upload validation or session-security changes are introduced.
Consent validation accepts only the exact historical Gemini and current
local-first disclosure tuples; mixed versions are rejected.

Manual validation of this polish is still needed on the Windows host: confirm
short Spanish-first help for “No entiendo”, two consecutive voice turns without
stale `stream:`, and the available voices, selected speed/voice persistence,
mute and stop. No silent model downloads or cloud TTS/STT are introduced.


Polish validation used pinned Node 20.20.0 / pnpm 10.28.1, an isolated PostgreSQL
17.6 / Redis 8.2.1 harness, and fake browser/AI/speech providers. Passed: lint,
typecheck, build, 83 unit tests, 2 boundary tests, 32 AI contracts, 7 voice
contracts, identity (16), sessions/voice (12), jobs (7), analysis (18), job
resilience (8), voice resilience (5), smoke (3), the 48-case synthetic evaluation,
and browser voice (8), onboarding (1), conversation (2), reports (5). The updated
voice fixture completes onboarding instead of relying on suite order. Browser gates used the same prestarted test servers to
avoid concurrent-build startup contention; all final browser runs passed. API, worker and web images also built using a temporary
proxy-CA mount outside the repository. Compose migration/service health passed
with a temporary overlay that routes loopback probes directly instead of through
the workspace proxy; repository Docker/Compose files remain unchanged.


### Local-first consent audit provenance correction (2026-10-05)

New acceptances now store `local-ai-practice`, `privacy-2026-10-05`, and
`local-first-2026-10-05`, matching the version shown during onboarding. The
historical Gemini tuple remains compatible in consent/onboarding input and
history without any record rewrite or database migration. A legacy-only history
does not pre-check the current disclosure checkbox; the learner must accept the
local-first disclosure separately. Domain validation and the HTTP discriminated
union require exact tuples and reject mixed versions before persistence.

These records identify the disclosure actually accepted, not provider routing.
If Gemini is enabled later, it requires its own explicit disclosure and consent
against reviewed current terms; neither a local-first acceptance nor historical
compatibility silently authorizes Gemini processing.

Audit-correction validation passed: `pnpm lint`, `pnpm typecheck`, 88 unit tests,
19 identity integration tests, 2 onboarding browser tests and 8 voice browser
tests. Boundary/build, AI/voice contract, session/job/analysis integration,
job/voice resilience, conversation/report browser, smoke and 48-case synthetic
evaluation gates also passed. Updated API/worker/web images and Compose
migration/service health passed with the same temporary proxy-trust/loopback
validation overlays. No migration or historical-record rewrite was added.

### PR #22 — Grounded Spanish help (2026-10-05)

`tutor-v4` is retained. Both Ollama and Gemini receive the most recent tutor turn
as `helpSourceTurn` in untrusted user data, selected from the ordered conversation
without using later learner/help turns. Normal turns retain their English policy.
Repeated button help retains that tutor source within the 40-turn context cap,
even after it would otherwise leave the recent-turn window.

The help policy requires exactly two short parts on separate lines, under 60
words total: first explain/translate that specific tutor turn in Spanish; then
give exactly one simpler English paraphrase/question preserving its intent.
Never explain/translate “No entiendo” itself, ask what it means, introduce a new
topic, or add requests, choices, scenario details, information, or a separate
invitation to continue. Without a previous tutor turn, give brief Spanish
reassurance followed by one simple English question appropriate to the scenario.
Help takes precedence over level scaffolding and corrections in either mode.
Explicit help is rejected as both correction and strength evidence, and the fake
analyzer skips help when selecting learner evidence.

Regression coverage includes A1/A2/B1/B2 × natural/teaching, both explicit help
phrases and button help, the two supplied examples, older tutor distractors,
later learner/help turns, untrusted source text, no-tutor fallback, normal
English policy, and help-evidence exclusion. All 48 eval fixtures still use
`tutor-v4`; their fixture version is `pilot-text-fixtures-v2`. The evaluator now
includes its generated tutor reply before requesting help, records that source,
and checks two-part structure, one final sentence, and the word limit. The fake
help response is only a structural fixture; semantic grounding and language
quality require live human review, explicitly included in the eval rubric.

Validation uses pinned Node 20.20.0 / pnpm 10.28.1 and isolated PostgreSQL 17.6 /
Redis 8.2.1, with fake AI/speech and network-free provider contracts. No live
Gemini or local Windows/Ollama validation is claimed.

Passed commands: `pnpm lint`, `pnpm typecheck`, `pnpm build`,
`pnpm test:unit` (99), `pnpm test:contract:ai` (36),
`pnpm test:boundaries` (2), `pnpm test:contract:voice` (7),
`pnpm test:integration:sessions` (12), `pnpm test:integration:analysis` (18),
`pnpm test:e2e:conversation` (2), `pnpm test:e2e:voice` (8),
`pnpm test:e2e:reports` (5), and
`pnpm eval:ai -- --suite pilot-text --billing-mode free_only` (48 synthetic cases).
The database harness was prepared with `pnpm db:migrate:test` (six migrations).

After merge, the Windows host must produce the following behavior with real
spoken help (repeat in both modes):

Previous tutor: “How can I help you today?” Learner: “No entiendo.”

Expected example:

> Te he preguntado: «¿En qué puedo ayudarte hoy?»
>
> How can I help you?

Confirm that Spanish explains that exact preceding sentence, the single English
question preserves its intent, and the next normal turn returns to English.

## M07 recurring learning priorities (2026-10-05)

M07 adds the Spanish-first “Prioridades recurrentes” section with counts,
expandable exact learner examples, dismissal and explicit restoration. Recurrence
requires **3 validated observations across 2 distinct practice sessions within a
rolling 30-day window**. One issue per learner turn counts once; repeated findings,
retry, duplicate delivery and reanalysis do not inflate sessions or observations.
Session completion time anchors the window, so reanalysis cannot refresh old work.

The domain owns eight `language-issues-v1` grammar/vocabulary categories.

## Vocabulary and review scheduling (M08)

The Spanish-first practice screen exposes conservative `vocabulary-suggestion-v1`
items derived deterministically from validated, current report corrections. A
learner must choose **Añadir al repaso** before a card is created; **Ignorar**
never schedules it. The authenticated endpoints under `/api/v1/vocabulary`
list/action suggestions, list cards, return a bounded due queue, accept
idempotent version-checked ratings, and expose immutable card history.

PostgreSQL is authoritative for suggestions, cards and review events. Exact
normalization, phrase/sense uniqueness, `vocab-scheduler-v1` intervals, UTC and
boundary behavior, concurrency, stale versions, and report/session deletion are
documented in [ADR 0013](docs/adr/0013-vocabulary-and-spaced-repetition.md) and
the [M08 data lifecycle](docs/m08-data-lifecycle.md). The scheduler is a simple
deterministic product rule, not a scientifically validated or optimal memory
model. This milestone adds no cloud/paid dependency, shared deck, scraping,
offline sync, streak or learning-plan behavior.
`analysis-v3` requests stable category headings while retaining `report-v1` JSON,
existing evidence validation and local Ollama. A deterministic classifier accepts
explicit keys or a small versioned English/Spanish alias list; strengths and
unknown headings produce no observation. These are learning priorities, not
psychological profiles, proficiency scores, diagnoses or certified CEFR weaknesses.
Quote validation does not establish that the model's language explanation is right.

Current successful validated reports are authoritative. Materialized observations
record taxonomy/source identities and accepted exact evidence; a SQL view and
pure domain algorithm derive recurrence. Reads rebuild and revalidate per account,
repairing missing/invalid/deleted sources. Superseded reports stop contributing
as soon as the transcript revision changes. Report success and observation writes
commit together with the existing provider audit/job effect. No extra AI call,
paid/cloud dependency, audio storage, review scheduling or generated plan is added.

Dismissal is separate account-scoped state and remains effective until explicit
restoration, including after new evidence, disappearance and rebuild. The UI hides
it from active priorities and offers a collapsed restore list for currently
recurring dismissed issues. The API can also restore a saved dismissal below the
threshold. Account deletion removes observations and dismissals; source deletion
removes observations and preserves dismissal preference.

See [ADR 0012](docs/adr/0012-recurring-language-priorities.md) and
[M07 schema/data lifecycle](docs/m07-data-lifecycle.md) for classification,
source constraints, authenticated contracts, rebuild, migration and rollback.
Run `pnpm test:integration:issues` with migrated PostgreSQL and `AI_PROVIDER=fake`;
run `pnpm test:e2e:issues` with PostgreSQL, Redis and fake text/speech providers.
These gates fail on missing infrastructure or zero tests. Normal builds retain
Ollama / whisper.cpp / browser speechSynthesis defaults.

Manual validation remains: review real local Ollama `analysis-v3` category and
correction quality on synthetic multi-session practice; inspect Spanish wording,
keyboard evidence/dismiss/restore controls, and local browser/voice behavior.
M07 does not authorize real learner access before the existing M10/M11 gates.


## Plans, goals and active progress (M09)

The current learner experience is an automatically activated **Tu ruta de inglés**
with completed steps, a dominant current-step card and one main action. Profile
navigation contains no recommendations or plan lifecycle controls. **Práctica
libre** remains secondary. [ADR 0020](docs/adr/0020-roadmap-first-learning.md)
documents the fourteen-topic catalog, interests, safe local Ollama selection,
deterministic fallback, adaptation and idempotent session startup. Internal legacy
plan endpoints remain available, with account isolation and optimistic versions.
Completion still requires canonical accepted conversation/review evidence.

Active voice milliseconds count only when a successful accepted turn commits.
Active text intervals between edits are bounded and exclude idle >30 seconds,
blur/hidden and tutor latency; legacy text duration is zero. Speaking/text totals
stay separate. Speaking streak qualifies at two minutes of accepted voice per
saved local date. Current-week goals start Monday in the current learner zone,
while all historical local dates remain immutable snapshots of their event zone.
M08 review events supply counts directly. ENDED counts once; ABANDONED/FAILED do
not count as completed. Transparent issue buckets make no direction/level claim.

See [ADR 0014](docs/adr/0014-plans-and-active-progress.md) for precise selection,
streak, weekly-boundary, active-time, issue-trend and legacy-UTC definitions, and
[M09 data lifecycle](docs/m09-data-lifecycle.md) for rebuild/deletion/migration
semantics. Apply forward migration `202610070001_tutor_opening_progress` (including all predecessors) before API
startup. Readiness rejects missing roadmap/opening-progress migrations and roadmap columns. No aggregate cache is
the sole source of truth.

New required gates are `pnpm test:integration:plans`,
`pnpm test:integration:progress`, and `pnpm test:e2e:progress`; CI runs them with
PostgreSQL, Redis and fake text/speech. Existing unit, boundary, build, migration,
identity, sessions, jobs, analysis, issues, reviews, resilience, AI/voice contract,
onboarding, conversation, reports, priorities, vocabulary, voice and smoke gates
remain mandatory. Run `pnpm eval:ai -- --suite plans --billing-mode free_only` for the versioned
synthetic roadmap evaluation; `--live --max-calls 6` optionally uses local Ollama. Real Ollama/whisper and physical-browser active typing/voice playback
validation remain manual; fake CI does not prove live educational/device quality.

The roadmap results are recorded in [roadmap validation](docs/roadmap-validation.md).
[M09 validation](docs/m09-validation.md) retains the original milestone results.

## M10 privacy lifecycle and operational hardening

Implementation ready for technical review; not marked Complete before the M10
GitHub CI gates execute. See [privacy lifecycle](docs/m10-privacy-lifecycle.md),
[Prisma/data lifecycle](docs/m10-data-lifecycle.md), [deletion ADR](docs/adr/0015-deletion-epochs-and-tombstone-replay.md),
[retention ADR](docs/adr/0016-ninety-day-source-retention.md), [restore runbook](docs/m10-restore-runbook.md),
[security/logging policy](docs/m10-security-policy.md), [accessibility scope](docs/m10-accessibility.md),
and [load/resilience playbook](docs/m10-load-and-resilience.md).
Exact commands, counts and measurements are in [M10 validation](docs/m10-validation.md). No M11 deployment
or cloud/paid resource provisioning is included. External provider
retention/deletion must be independently verified before enabling any optional
remote provider for real learner data.

## M11 release readiness (blocked, incomplete)

See [ADR 0017](docs/adr/0017-m11-blocked-zero-cost-release.md),
[dated provider verification](docs/m11-provider-verification.md),
[release/recovery runbook](docs/m11-release-runbook.md),
[secret inventory](docs/m11-secret-inventory.md),
[pilot/device checklist](docs/m11-pilot-checklist.md) and
[validation](docs/m11-validation.md). CI retains all M10 and earlier gates and
adds `pnpm test:migrations`, `pnpm release:preflight`, `pnpm test:deployment`,
`pnpm test:release` and `pnpm test:e2e:cold-start`. Repository preflight reports
blocked deployment; it is not production approval. Explicit-base-URL smoke
commands cannot claim a pass without a real network response. Runtime and
release check refuse the current cloud architecture; no deployment or worker
provisioning is supplied. Ollama/whisper.cpp and EUR 0/free-only remain unchanged.

## M12 future-mode discovery (2026-10-06)

Discovery specs and matrices are prepared and reviewed for document consistency;
PR approval and specialist sign-offs remain pending. Neither mode is implemented.
See the [review/decision record and proposed milestones](docs/m12-discovery.md),
[exam practice specification](docs/m12-exam-practice-spec.md),
[teacher/family sharing specification](docs/m12-learner-sharing-spec.md),
[pre-implementation test matrices](docs/m12-test-matrices.md),
[ADR 0018](docs/adr/0018-practice-only-exam-evaluation.md) and
[ADR 0019](docs/adr/0019-explicit-revocable-learner-sharing.md).

The proposed first slices use original tasks and qualitative practice-only exam
feedback, plus separate affirmative adult learner consent for individually named,
read-only summary recipients with selected scope, bounded expiry and revocation.
No exam family/official scale is approved. Rights, rubric/model validity, consent,
age/guardian rules, authorization/restore, audit retention and export handling
remain explicit future gates. Current learner access/privacy and M10/M11 release
blockers remain unchanged. No dashboard role or sharing feature is installed.

Matrices specify 48 core + 20 adverse synthetic exam cases, role/access,
consent/revocation, two-account isolation and deletion/export effects. These are
future contracts, not runnable or passing tests. M12 requires manual document
review; future commands/fixtures belong to a separately accepted implementation
plan. No M13 implementation, deployment or pilot is included.
