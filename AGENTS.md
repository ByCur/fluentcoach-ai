# FluentCoach AI — Contributor rules

## State and scope

- Planning only: no application or validation commands are implemented yet.
- Read `SPEC.md`, `PLAN.md` and `DOCUMENTATION.md` before implementation.
- Work on the requested milestone; do not implement later scope speculatively.
- Record material architecture changes in ADRs and update affected documents.

## Architecture and data

- Follow the proposed strict TypeScript modular architecture once M00 confirms
  it. Domain/application code must not import framework, ORM or provider SDKs.
- Keep AI SDKs behind application-owned ports. Validate output schemas, evidence,
  references and ownership before applying AI-generated proposals.
- PostgreSQL is canonical learner state; Redis is delivery/cache infrastructure.
- Scope queries, writes, streams and jobs to accounts; use database constraints
  as well as application checks and test two-account isolation.
- Make commands/worker effects idempotent; commit outbox with domain changes.
  Never assume exactly-once delivery or external provider execution.
- Version prompts, report schemas, taxonomy, review algorithms and job envelopes.

## Product and privacy

- Preserve deferred Natural Conversation corrections and useful Teaching Mode
  corrections after completed turns. Keep A1–B2 and Spanish help explicit.
- Findings need evidence; do not claim certified CEFR or pronunciation from text.
- No audio storage by default; never log learner content, prompts or secrets.
  Keep AI keys server-side and media credentials scoped and short-lived.
- Respect retention/deletion including in-flight work. No real-data pilot before
  PLAN.md privacy and release gates.

## Delivery and checks

- Pin dependencies/runtime and commit the package-manager lockfile.
- Use migrations; document compatibility and rollback limits.
- Test invariants deterministically; use real PostgreSQL/Redis for transaction
  and queue tests. Normal CI uses fake AI, not paid provider calls.
- Run actual milestone checks; planned commands are not available until built.
  Report skipped/failed checks without claiming completion.
- Validate prompt/provider changes with versioned, cost-capped evaluations.
- Keep setup and architecture docs current. Never commit secrets, real learner
  fixtures, exports or unrelated scaffolding.
