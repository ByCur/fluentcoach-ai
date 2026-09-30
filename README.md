# FluentCoach AI

FluentCoach is a strict TypeScript modular monolith for a private English-learning
pilot. The foundation, isolated identity/onboarding, deterministic text sessions,
and durable jobs are implemented. M05 adds a bounded Gemini text adapter and
validated automatic reports with retry and cited learner turns. Its offline
checks pass; the live entry gate remains blocked by unavailable owner-approved
Free-Tier credentials. Voice remains outside this implementation.

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

Development and CI use deterministic synthetic providers. Ending a session
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

Live checks are explicit and synthetic-only:

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
