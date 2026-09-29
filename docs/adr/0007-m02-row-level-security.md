# ADR 0007: Defer PostgreSQL row-level security for M02

- **Status:** accepted, review required before multi-user production
- **Date:** 2026-09-29

## Decision

Do not enable RLS in M02. Prisma migrations run with a table-owning role, which bypasses ordinary RLS unless forced; request-scoped transaction variables and separate migration/runtime roles are not yet part of the zero-cost deployment design. Enabling nominal policies now would create a misleading isolation claim and fragile pooled-connection behavior.

Every repository query instead derives `account_id` exclusively from the validated server session. No request DTO accepts an owner account ID. Unique account relationships, foreign keys, cascades, checks, and account-scoped query predicates provide independent controls. Integration and browser tests use synthetic identities to exercise uniqueness, guessed IDs, cross-account scoped reads and invalid foreign relationships.

## Review trigger

Revisit before more than the private invited pilot, before exposing generic ID-addressed resources, or when Neon runtime/migration roles and transaction-scoped account context are proven. If adopted, use a non-owner runtime role, force RLS where appropriate, set the account context inside each transaction, deny missing context, and retain application ownership checks and two-account tests.
