# FluentCoach AI — Contributor rules

## Scope and context

- Work only on the requested milestone or fix; do not start later milestones.
- Prepare pull requests for review, but never merge them.
- Search with `rg` and read targeted ranges. Locate the relevant `PLAN.md`
  milestone, then read only applicable `SPEC.md`, ADR, and implementation sections.
- Record material architecture changes in ADRs and update affected documents.

## Architecture and data

- Keep the strict TypeScript modular architecture. Domain/application code must
  not import frameworks, ORMs, infrastructure, or provider SDKs.
- Keep AI SDKs behind application-owned ports. Validate schemas, evidence,
  references, and ownership before applying AI proposals.
- PostgreSQL is canonical learner state; Redis is delivery/cache infrastructure.
- Scope all operations to accounts; enforce isolation in code and database
  constraints, with deterministic two-account tests.
- Make effects idempotent and commit outbox records with domain changes. Never
  assume exactly-once delivery or provider execution.
- Version prompts, report schemas, taxonomy, review algorithms, and job envelopes.

## Product and privacy

- Preserve deferred Natural Conversation corrections and useful Teaching Mode
  corrections. Keep A1–B2 and Spanish help explicit.
- Findings require evidence; never claim certified CEFR or pronunciation from text.
- Store no audio by default. Never log learner content, prompts, or secrets; keep
  AI keys server-side and media credentials scoped and short-lived.
- Respect retention/deletion during in-flight work. Meet `PLAN.md` privacy and
  release gates before any real-data pilot.

## Delivery

- Pin dependencies and runtimes; commit the package-manager lockfile.
- Use migrations and document compatibility and rollback limits.
- Test deterministically. Use real PostgreSQL/Redis for transaction and queue
  tests; normal CI uses fake AI, not paid provider calls.
- Run every requested milestone gate, fix failures, and never bypass tests.
  Report skipped or failed checks without claiming completion.
- Keep the initial pilot in `BILLING_MODE=free_only`; fail closed on exhausted
  quotas or unavailable providers, with no paid service or billable fallback.
- Validate prompt/provider changes with versioned, cost-capped evaluations.
- Keep setup, status, and architecture docs current. Never commit secrets, real
  learner fixtures, exports, or unrelated scaffolding.
