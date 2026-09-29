# ADR 0001: M01 TypeScript foundation

- **Status:** accepted for M01
- **Date:** 2026-09-28
- **Scope:** repository/runtime foundation only

## Context

The product specification proposes a TypeScript modular monolith with separate
web, API, and worker processes. M01 must make its quality gates reproducible while
not pre-empting M00 provider, voice, identity, hosting, or privacy decisions.

## Decision

Pin Node 20.20.x, pnpm 10.28.1, TypeScript 5.9.2, NestJS 11, React 19/Vite 7,
PostgreSQL 17.6, and Redis 8.2.1. Use pnpm workspaces with pure `domain` and
`application` packages, runtime-validated `contracts`, and adapter-oriented
`infrastructure`. Enforce prohibited inward dependencies through both ESLint and
an executable boundary test.

Build three non-root/minimal container targets from one multi-stage Dockerfile.
Compose retains local PostgreSQL and Redis volumes and orders app readiness after
dependency health. Process liveness does not inspect dependencies; readiness does.
Configuration validation reports field names but never rejected values.

Do not add Prisma or an empty database migration before M02 owns its first schema.
Consequently M01 readiness checks connectivity but has no schema version to check.
Once migrations exist, readiness must also remain false until the compatible
schema is installed by the explicit migration job.

## Consequences

The repository is runnable and later modules have enforceable dependency
directions. Docker images currently retain workspace development dependencies in
the API/worker runtime layers; production pruning and image scanning are an M10
hardening concern, without changing the non-root runtime. M00 choices remain open:
this ADR does not select an AI provider, voice transport, identity, or hosting.

## Alternatives

A single process was rejected because it would not exercise the planned topology.
Adding placeholder product tables was rejected as speculative M02 scope. A custom
dependency checker alone was rejected in favor of redundant lint and test gates.

## Review triggers

Review when Node 20 leaves support, when M00 compatibility evidence requires a
stack change, or when the first migration introduces schema-readiness semantics.
