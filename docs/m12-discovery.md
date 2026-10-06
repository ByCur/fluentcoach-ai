# M12 — Future-mode discovery and review record

Status: **Discovery documents prepared and consistency reviewed; PR approval pending.**
Neither future mode is implemented. Date: 2026-10-06.
Base: latest fetched `main` at `3a73464870cc53d844dccae1e75a18abda8fdec5`
(M11 PR #28). M10/M11 real-data/privacy/release gates remain in force; M11 is
incomplete and cloud release is blocked. No M13 work or future implementation
is authorized by this document.

## Deliverables and decisions

| Deliverable | Discovery decision |
| --- | --- |
| [Exam specification](m12-exam-practice-spec.md) / [ADR 0018](adr/0018-practice-only-exam-evaluation.md) | Candidate families listed, none approved; recommend original tasks and qualitative practice-only feedback first; independent rubric/evidence/version checks, no official scoring or transcript pronunciation claims |
| [Sharing specification](m12-learner-sharing-spec.md) / [ADR 0019](adr/0019-explicit-revocable-learner-sharing.md) | Recommend adult-only, read-only, named-recipient summaries with separate affirmative learner consent, selected scope and bounded expiry; no implicit teacher/family privileges or access to originals |
| [Pre-implementation test matrices](m12-test-matrices.md) | 48 core + 20 adverse synthetic exam cases; role/access, consent/revocation, two-account and deletion/export contracts defined before code |

These are proposed future decisions, not accepted architecture changes to current
APIs, schemas, UI, roles or sharing. Existing owner-only resource authorization,
local Ollama/whisper.cpp, no stored audio, free-only policy, consent provenance,
90-day source retention and account deletion/export remain unchanged. No task
pack, runnable fixture, new feature script, paid service or real learner data is added.

## Unresolved gates and accountable review

Roles below identify required decision owners, not nominated people or completed
sign-offs. The product owner must name reviewers and record dated evidence in the
separate future plan. A blocked gate blocks its affected slice, not unrelated
synthetic discovery. Do not treat this PR or the proposals as legal/assessment approval.

| Gate | Unresolved decision/evidence | Required decision owner | Blocks |
| --- | --- | --- | --- |
| E1 | Select original task scope or exam family/variant; verify dated format, levels and target learner suitability | Product owner + qualified English-assessment reviewer | Task/rubric implementation acceptance |
| E2 | Review rubric anchors, dialect handling, assistance, insufficiency, Spanish practice disclaimer and accessibility | Assessment reviewer + learner-experience reviewer | Feedback implementation acceptance |
| E3 | Verify task/rubric/media authorship, licenses, model processing, mark use, rights expiry and lawful retention/export handling | Product owner + competent content-rights/privacy reviewer | Any external content use; task release |
| E4 | Approve held-out fixture split, anchor tolerances, independent reviewer agreement, minimum samples and provisional 90% useful-feedback threshold; run capped model evaluation | Assessment reviewer + engineering owner | Pedagogical quality claim and real-data exam release |
| S1 | Verify adult admission/identity, consent/lawful basis, recipient verification and safeguards; separately resolve jurisdiction/age/guardian/assent/custody/coming-of-age rules for minors | Product owner + competent privacy/legal reviewer | Real-data sharing; minors remain excluded until separate design |
| S2 | Approve scope allowlists, fixed periods, maximum grant duration, renewal and Spanish preview/consent wording | Product owner + privacy + learner-experience reviewers | Consent/projection implementation acceptance |
| S3 | Choose authorization/projection design, revisit ADR 0007 RLS trigger, prove pooled isolation, revocation/handoff/cache bounds, idempotency and revoke restore replay | Security/engineering owner | Multi-account sharing implementation acceptance and release |
| S4 | Approve audit integrity/failure semantics/retention/anonymization, recipient identifiers in exports and deletion exceptions | Privacy/legal + security/engineering owners | Audit/export implementation acceptance and real-data sharing |
| S5 | Resolve existing M10/M11 hosting, identity, provider/privacy, backup, free-only and operational release blockers; show new audit/projection costs fit the same envelope | Product + operations/security owners | Any real learner/recipient pilot or deployment |

Official-scale prediction/calibration, reading/listening media, acoustic assessment,
organization/classroom access, write permissions, raw evidence sharing and guardian
control are separate expansion decisions, not pending toggles in the first slice.
No thresholds or jurisdictional requirements are invented as verified law.

## Proposed small follow-up milestones

These are proposals for a **separately accepted plan**, not M13 or additions to
this plan's implementation scope. Each should have its own small reviewable PR
only after acceptance; M12 itself is one documentation-only PR. Prove the matrix
cases before enabling the behavior. No live learner/recipient work before S5.

| Slice | Bounded deliverable if a future plan is accepted | Entry / exit requirements |
| --- | --- | --- |
| E-A | Review one original task pack and rubric; define versioned synthetic fixtures | Entry E1–E3 reviewers assigned; exit E1–E3 resolved for that pack and 68-case expectations reviewed; no product feature |
| E-B | Implement bounded evaluator/evidence validation against fake responses only | Entry E-A and reviewed separate architecture/output contract; exit all critical exam matrix cases, ownership and deletion fencing pass |
| E-C | Add one learner-private task submission/feedback flow | Entry E2 plus E-B; exit assistance/limitations, insufficient-data, Spanish/accessibility and existing tutor regressions pass; no branded or official scores |
| E-D | Run independent local model review and consider an adult learner-only pilot | Entry E4 protocol and S5; exit versioned evaluation evidence and explicit pilot approval; branded expansion needs its own E1/E3 review |
| S-A | Approve adult sharing policy, exact field allowlists, identity/consent and audit/export/restore design | Entry named S1–S4 reviewers; exit policy/design decisions resolved and matrix outcomes reviewed; runtime evidence remains due in S-B/S-D; no recipient access |
| S-B | Implement canonical grant/revoke/expire authorization with synthetic accounts only | Entry S-A; exit role/consent/two-account, concurrency, durable audit and restore replay cases pass; owner boundaries intact |
| S-C | Add minimal learner recipient preview, affirmative consent, scope view and one/all revoke controls | Entry S-B; exit exact preview, no prechecked/bundled consent, Spanish keyboard/status and revoke visibility browser cases pass |
| S-D | Add one read-only authenticated recipient summary projection | Entry S-C and proven S3 delivery/cache bounds; exit no originals/quotes/export/implicit items and isolation/expiry/denial cases pass |
| S-E | Validate future lifecycle integration and assess adult-only sharing pilot | Entry S-D; exit deletion/export/audit/restore matrix and S5 release gates pass; minors still blocked |

Exam and sharing tracks are independent; enabling one does not grant the other
access or auto-share exam feedback. Combining tracks needs a fresh scope, consent,
rights and export review.

## Document review and traceability

Review performed by the PR author (Codex) on 2026-10-06: requirements, internal
consistency and repository privacy/lifecycle boundaries. This is not independent
pedagogical, legal, guardian, security certification or human PR approval. The
PR remains open for repository review; no reviewer approval is asserted.

| Review check | Evidence / result |
| --- | --- |
| PLAN M12 and SPEC F15/non-goals read before drafting | Separate future specs, ADRs and bounded proposals cover discovery only |
| Exam families, rubric, rights, practice/official distinction, evidence, fixtures and risks | Exam specification plus E1–E4 and X01–X20; no supported family/calibrated score claim |
| Consent, revocation, permissions and learner visibility | Sharing specification and role/C matrices; consent separate from existing AI disclosure |
| Isolation and no implicit access | Owner paths preserved, projection allowlist, I01–I12; role label or invitation is insufficient |
| Audit, restore, deletion/export and minors | S1/S3/S4 gates, C17 and D01–D12; no indefinite audit or guardian entitlement |
| Review of M10 ADRs 0015/0016 and M11 ADR 0017 | No changed retention/deletion fence or release approval; future revoke replay required |
| Scope/claim check | Only Markdown documents change; no API, DB, UI, auth, runnable fixtures or M13 implementation; future matrices explicitly unexecuted |

Review resolved three consistency risks in the drafts: a summary must omit copied
report/plan evidence as well as source links; recipient deletion must preserve the
learner's source state; account tombstone replay cannot substitute for restoring
future grant revocations. Already transmitted bytes/copies are explicitly outside
revocation's recall guarantee. Actual check results are recorded below and in the
PR; future matrices are not counted as tests run.

## Validation record

M12's gate is manual document/decision review. Verify Markdown references and
whitespace, required topic/matrix coverage and changed-path scope. Existing common
repository gates are recorded separately; they do not validate future modes or
clear specialist/release gates. No live model, provider, deployment, real-data or
future-feature test is claimed. PR creation concludes this request; do not merge.

| Check (2026-10-06) | Result |
| --- | --- |
| Manual requirements/decision/lifecycle review | Passed for discovery scope; specialist and human PR approvals remain open |
| Local Markdown file/anchor references | 61 references checked across all nine affected documents; passed |
| Matrix identifier/count check | X01–X20, C01–C19, I01–I12, D01–D12 complete and unique; future cases unexecuted |
| Staged scope and `git diff --cached --check` | Exactly nine authorized Markdown files; whitespace check passed |
| Frozen dependency install | Passed using Node 20.20.0 / pnpm 10.28.1; lockfile unchanged |
| `pnpm lint`, `pnpm typecheck`, `pnpm build` | Passed after frozen install |
| `pnpm test:unit` | 166 existing tests passed in 27 files after frozen install |

Initial common-check attempts encountered stale preloaded dependencies (missing
workspace/third-party types); the frozen install corrected the environment and
all common gates were rerun successfully. No product source or dependency files
were changed to resolve this. Integration/browser/security/deployment and live
model suites were not run locally for this discovery-only change; existing CI
remains unchanged. No future-mode fixture or authorization test was executed.
