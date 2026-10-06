# ADR 0019 — Explicit, bounded and revocable learner sharing

- Status: proposed future decision; document consistency reviewed in M12, specialist approval open
- Date: 2026-10-06
- Scope: SPEC F15 / M12 discovery only; current ownership/privacy behavior unchanged

## Context

The current account-scoped product has no teacher/family entitlement. AI-processing
consent is not consent to share with another person. Expanding access creates
consent, isolation, revocation, copy, restore and age/guardian risks that the
existing owner-only interfaces and account tombstones do not by themselves solve.

## Proposed decision

Require separate affirmative adult learner consent to a verified named recipient,
exact selected fields/items and historical period, purpose and bounded expiry.
Teacher/family are per-learner relationship labels, not global privileges.
Propose read-only summary projections; exclude original transcripts, quotes,
exports, exam results, onward sharing and implicit future items in the first slice.
An accepted invitation without learner-approved identity/scope has no access.

Require canonical active-account/grant/source checks at every entry point and
new handoff. Revocation commit denies subsequent authorization; queued work,
caches, streams, tokens and restored state cannot extend permission. Already
transmitted copies cannot be recalled. Keep learner-visible recipient/scope and
restricted audit history, subject to an approved minimal retention policy.
Account/source deletion and export must extend the existing lifecycle without
weakening it. Revisit ADR 0007 before multi-user access; no RLS/role/schema choice
or identity-provider entitlement is made here. Unknown age/guardian authority
blocks sharing; minors require a separate jurisdiction-aware design.

## Alternatives and consequences

Reject implicit family/teacher roles, email-domain grants, public bearer links and
reusing entire learner report payloads: they can expose unselected personal data.
Reject cached/token-only authorization that delays revocation and blanket school
or guardian authority. Per-recipient projections and durable audit introduce
future consistency/cost work, but keep boundaries reviewable. The product cannot
promise control over screenshots or copies held outside its service.

## Acceptance and review triggers

S1–S5 and a separate accepted implementation plan are required for the relevant
slice; adult-only entry does not resolve minors. Revisit for organizations, writes,
exports/downloads, quotes, prospective windows, guardian authority or offline data.
See [sharing specification](../m12-learner-sharing-spec.md),
[test matrices](../m12-test-matrices.md) and [M12 gates](../m12-discovery.md).
