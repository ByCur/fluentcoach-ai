# FluentCoach AI

FluentCoach is a strict TypeScript modular monolith for a private English-learning
pilot. The foundation, isolated identity/onboarding, deterministic text sessions,
and durable jobs are implemented. Text AI is local-first through Ollama, with a
bounded Gemini adapter retained as an explicit optional provider, and M05 adds
validated automatic reports with retry and cited learner turns. Its offline
checks pass; real local-model performance still requires host smoke validation,
while Gemini's optional live checks require separately approved Free-Tier
credentials. Local push-to-talk voice uses whisper.cpp and browser speechSynthesis. M11 adds
release tooling, but secure zero-cost cloud text/voice hosting remains blocked;
staging/production and the private learner pilot are not complete. See
[release runbook](docs/m11-release-runbook.md) and [provider verification](docs/m11-provider-verification.md).

After completing onboarding, learners land on Inicio: practice or continue a
conversation, recommendations from their existing plan and due vocabulary,
recurring practice examples, and a weekly progress summary. The top-right profile
menu opens Mi perfil, Mis recomendaciones, Lo que debo mejorar, Mi vocabulario,
Mi plan, Mi progreso, and Cerrar sesión. Privacy/export/deletion controls remain
available from Mi perfil. These views reuse M07–M09 account-scoped endpoints;
opening Inicio does not generate or accept a plan.

## Prerequisites

- Node.js **20.20.x** (see `.nvmrc`)
- pnpm **10.28.1** through Corepack
- Docker Engine with Compose v2

Enable the pinned package manager with `corepack enable`. Do not use an unpinned
global pnpm version.

## Fresh-clone setup

### macOS/Linux

```sh
cp .env.example .env
corepack pnpm install --frozen-lockfile
docker compose config --quiet
docker compose up --build --wait
corepack pnpm test:smoke
```

Open the web shell at <http://localhost:8080>. API liveness and readiness are at
`http://localhost:3000/health/live` and `/health/ready`. Stop the stack with
`docker compose down`; persistent database/cache volumes are intentionally kept.

### Windows PowerShell

```powershell
Copy-Item .env.example .env
corepack pnpm install --frozen-lockfile
docker compose config --quiet
docker compose up --build --wait
corepack pnpm test:smoke
```

Run all commands from the repository root. `.env` is for host-run processes and
is ignored by Git; Compose supplies service-network addresses itself. The values
shipped here are development-only and must never be used outside local machines.

For host debugging, start only `postgres` and `redis` with Docker, then run
`corepack pnpm dev`. The `.env.example` URLs point at their published default
ports. API and worker fail during startup if required configuration is invalid.

## Quality gates

```sh
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test:unit
corepack pnpm test:boundaries
corepack pnpm build
corepack pnpm test:smoke
```

`test:smoke` verifies the container contract; after `docker compose up --wait`,
Compose additionally executes each runtime health check. Liveness only indicates
a running process. Readiness returns HTTP 503 until PostgreSQL, Redis, and the committed M05 Prisma migration and required columns are compatible. Compose waits for PostgreSQL, runs a one-shot `prisma migrate deploy`, then starts the API. Request handlers never create schema.

## Repository boundaries

- `packages/domain`: pure business rules; no framework, provider, ORM, or infrastructure imports.
- `packages/application`: use cases and application-owned ports; the same dependency restriction applies.
- `packages/contracts`: runtime-validated transport/event contracts.
- `packages/infrastructure`: configuration and later persistence/provider adapters.
- `apps/api`, `apps/worker`, `apps/web`: framework composition and delivery processes.

ESLint and `test:boundaries` enforce the protected imports independently. See
`SPEC.md`, `PLAN.md`, and `DOCUMENTATION.md` before implementing another milestone.

## Configuration safety

Only non-secret browser settings may use Vite's `VITE_` prefix. Server URLs and
future credentials must remain server-side. Validation errors name invalid fields
without printing values, URLs, passwords, or tokens. Do not commit `.env`, real learner
content, captured requests/prompts, exports, credentials, or real-data fixtures.
Versioned prompt templates and synthetic fixtures belong in the repository.

## M02 identity and onboarding

M02 adds PostgreSQL/Prisma learner state and a Spanish-first onboarding flow. Start PostgreSQL and Redis, apply the migration, then run API and web:

```bash
cp .env.example .env
pnpm db:migrate:dev
pnpm dev
```

Development uses the deterministic **synthetic** identity button; it is rejected when `NODE_ENV=production`. No password is implemented. Production uses the Auth0 Free manual-user design in ADR 0006: public signup disabled, Authorization Code + PKCE, exact callback/logout URLs, server-side token validation, and no Organizations feature. Tenant provisioning and live callback verification remain deployment gates. Sessions are opaque and server-side in Redis; browser state contains only an HttpOnly cookie. `BILLING_MODE=free_only` is the only accepted value.

An existing authenticated browser refreshes its CSRF value through `GET /api/v1/auth/csrf`; the opaque session ID remains only in the HttpOnly cookie.

`db:migrate:test` recreates an isolated test schema from the committed Prisma migration SQL; deployment and Compose use controlled `prisma migrate deploy`. M02 checks are `pnpm db:migrate:test`, `pnpm test:integration:identity`, and `pnpm test:e2e:onboarding`. They use synthetic accounts and require local PostgreSQL/Redis, never Auth0 or Gemini credentials.

## M05 text and reports

The default text provider is the local Ollama service at
`http://127.0.0.1:11434`, using `llama3.2:3b`; it requires no API key and does
not automatically fall back to Gemini. Install/pull the model outside the app,
then configure `.env` as follows:

```dotenv
AI_PROVIDER=ollama
AI_FALLBACK_PROVIDER=none
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.2:3b
```

On Windows, run Ollama on the host and run the API directly from the same host
for the default loopback URL. If the API runs in a container, set an explicitly
reachable host URL appropriate to that environment. Verify the real local model
with `pnpm smoke:ollama`; this sends one short synthetic teacher request and
prints provider, model, status, response, and elapsed time.

CI uses deterministic providers and mocked Ollama/Gemini HTTP; it never requires
a running model or paid call. Ending a session
atomically schedules analysis; the API reconciles durable work and the UI shows
pending, failed/retry, skipped-empty, or evidence-backed reports. History can
reopen a persisted report. Failed text responses retain the learner turn and
retry with the same request key. The adapter key stays on the server.

After `pnpm build`, run the M05 gates against isolated PostgreSQL/Redis:

```sh
pnpm test:contract:ai
pnpm test:integration:analysis
pnpm test:e2e:reports
pnpm eval:ai -- --suite pilot-text --billing-mode free_only
```

Set `DATABASE_URL` and `REDIS_URL` in the host environment for tests; these CLI
suites do not load the API's `.env`. `db:migrate:test` resets the selected test
schema. Keep that database separate from learner or ordinary development state.
The eval command defaults to the 48-case fake baseline and writes synthetic
results to `/tmp/fluentcoach-pilot-text-eval.json`; this does not pass the live
gate or establish educational quality.

Gemini checks are explicit and synthetic-only:

```sh
pnpm eval:ai -- --suite pilot-text --billing-mode free_only --live --max-calls 6 --offset 0
```

Before enabling them, the owner must review current Gemini model availability,
Free-Tier billing status, limits, allocated remaining quota and data terms, then
supply the server-only approval/key/quota fields in `.env.example`. Limits have no
live defaults. The candidate model is not assumed current or free. Each live
batch checks model availability/limits and uses at most six calls including that
check; advance the matrix offset for subsequent reviewed batches within verified
quotas. Artifacts record versions, usage, latency and the human rubric, with
human review explicitly pending. Do not set approval flags merely to bypass the
gate. Production defaults to disabled AI, rejects fake, and cannot submit real
learner content through M05. See [ADR 0009](docs/adr/0009-m05-text-and-reports.md)
for validation, budget, migration and rollback behavior.

## Codex workflows

Repository-local skills keep milestone implementation and PR repair focused. Use
these prompts, replacing the milestone or PR number when appropriate:

**Milestone**

> Implement M03 from PLAN.md. Use the fluentcoach-milestone skill. Prepare the PR and stop when all M03 gates pass. Do not merge.

**PR fix**

> Fix PR #N using the fluentcoach-pr-fix skill. Resolve review feedback and CI until green. Do not merge.

## M03/M04 deterministic practice and durable jobs

Practice exposes all six scenarios, A1/A2/B1/B2 and both modes. The fake tutor
streams three chunks; test mode delays each chunk to demonstrate incremental
rendering and cursor resume. Spanish help returns to English on the next tutor
turn. Session end freezes evidence and commits analysis/outbox atomically.

M03/M04 gates require migrated synthetic PostgreSQL data; the resilience gate
also uses PostgreSQL and fails when DATABASE_URL is missing. Run:

```bash
pnpm db:migrate:test
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:boundaries
pnpm build
pnpm test:integration:sessions
pnpm test:contract:ai
pnpm test:integration:jobs
pnpm test:resilience:jobs
pnpm test:e2e:conversation
```

Set DATABASE_URL, REDIS_URL and BILLING_MODE=free_only as in .env.example.
`db:migrate:test` drops the test schema: use an isolated disposable database.
Production job delivery requires QSTASH_TOKEN, both rotation signing keys and
PUBLIC_ORIGIN. The two job endpoints verify the exact signed raw body and public
URL; reconciliation must be scheduled. Missing transport retains PostgreSQL
work for recovery. No live or paid provider is used by these gates. See ADR 0008
for late revision semantics, recovery, migration compatibility and rollback.


## M06A local voice and privacy

The normal path is microphone -> local whisper.cpp -> transcript -> local Ollama
(`llama3.2:3b`) -> tutor reply -> browser `speechSynthesis`. It has no recurring
AI API cost. FluentCoach holds raw audio only in memory and does not persist it;
transcripts and tutor turns are persisted with the session. Install models and
host tools explicitly; the app does not download them silently.

The voice controls offer available English browser voices, preferring local
voices and then enhanced/natural voices when advertised by the browser. A saved
English voice is used when still available; otherwise playback falls back to a
preferred local English voice, any English voice, then the browser default.
Voice and speed (0.85–1.15x, default 0.95x) are saved only in browser localStorage.
The browser can load voices asynchronously. Mute prevents playback, and stop
cancels it. Browser/system TTS may use a remote service, so offline operation is
not guaranteed even though FluentCoach does not configure a cloud TTS provider.

New onboarding acceptances identify the local-first disclosure with
`local-ai-practice`, `privacy-2026-10-05`, and `local-first-2026-10-05`.
Historical records with the exact tuple `gemini-free-ai-practice`,
`privacy-2026-09-29`, `gemini-free-2026-09-29` remain valid historical records;
they are not rewritten or treated as acceptance of the local-first disclosure.
Contracts/domain validation accept these two exact tuples for compatibility and
reject mixed or unrelated versions. Existing string columns need no migration.

Gemini text remains explicit optional configuration behind its approval gates;
Gemini Live is only a future option. Neither is a silent fallback. Enabling
Gemini later requires its own explicit provider disclosure/consent and review
of then-current terms; local-first acceptance does not authorize Gemini use.

Explicit Spanish help starts with short Spanish help, then one simpler English
sentence/question (under 60 words); normal tutor turns remain in English.

The owner reports the Windows host gate passed with multilingual whisper.cpp
`base`, WebM/Opus microphone capture, Ollama `llama3.2:3b`, browser playback and
spoken “No entiendo”. After this polish change, manually recheck that phrase,
consecutive voice turns, voice availability/quality and stored speed/voice on
the target browser. Deterministic tests do not establish model response quality.
