# FluentCoach AI

FluentCoach is a strict TypeScript modular monolith for a private English-learning
pilot. Milestone M01 supplies only the executable foundation: process shells,
configuration, local data services, health checks, tests, and CI. It deliberately
contains no authentication, learner records, tutoring, AI, or voice behavior.

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
a running process. Readiness returns HTTP 503 until PostgreSQL and Redis can be
reached. No database schema exists in M01; Prisma migrations begin with the first
owned entities, so there is no placeholder/destructive migration command.

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
