# FluentCoach AI

FluentCoach is a strict TypeScript modular monolith for a private English-learning
pilot. M00–M02 are complete: the repository records the architecture and
feasibility decisions, provides the executable foundation and quality gates, and
implements isolated learner identity plus Spanish-first onboarding. Tutoring, AI,
and voice behavior remain later milestones.

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
a running process. Readiness returns HTTP 503 until PostgreSQL, Redis, and the committed M02 Prisma migration are compatible. Compose waits for PostgreSQL, runs a one-shot `prisma migrate deploy`, then starts the API. Request handlers never create schema.

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
without printing values, URLs, passwords, or tokens. Do not commit `.env`, learner
content, provider prompts, exports, credentials, or real-data fixtures.

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

## Codex workflows

Repository-local skills keep milestone implementation and PR repair focused. Use
these prompts, replacing the milestone or PR number when appropriate:

**Milestone**

> Implement M03 from PLAN.md. Use the fluentcoach-milestone skill. Prepare the PR and stop when all M03 gates pass. Do not merge.

**PR fix**

> Fix PR #N using the fluentcoach-pr-fix skill. Resolve review feedback and CI until green. Do not merge.
