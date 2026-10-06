# M12 discovery — Teacher/family dashboard and learner-data sharing

Status: **Future specification; no dashboard, sharing or new auth role implemented.**
Date: 2026-10-06. Requirement: SPEC F15; decision: [ADR 0019](adr/0019-explicit-revocable-learner-sharing.md).
Document review and outstanding specialist gates: [M12 discovery](m12-discovery.md).
All requirements below apply only to a separately accepted future plan.

## Boundary and proposed first scope

The current product remains a private learner account: only its authenticated
owner can access learner resources through existing ownership checks. Neither a
teacher/family label nor existing AI-processing consent grants third-party access.
Existing export, retention, account deletion, OIDC and provider behavior is unchanged.

Propose adult-only, individually named, authenticated, read-only recipients as the
first future slice. “Teacher” and “family viewer” describe a relationship to one
learner; neither is a global role or proof of guardianship. No classrooms, shared
accounts, organization membership, public links, domain-based access, peer groups,
recipient-to-recipient delegation or bulk views. Choosing Auth0 Organizations,
permissions claims, database tables or endpoints is outside M12.

Proposed scope groups, each separately selected with no prechecked choices:

| Scope | Potentially visible | Excluded |
| --- | --- | --- |
| Progress summary | Explicitly selected metrics and a fixed historical date interval: completed practice, separate text/voice time, review counts, learner goals if selected | No rolling future access, learner ranking, inferred proficiency, private goals by default, transcript or evidence quotes |
| Selected feedback | Individually selected currently valid reports/sections or recurring-priority summaries | No automatic future reports, raw transcripts, quoted examples or attached source links; insufficient evidence remains visible |
| Accepted practice plan | Explicitly selected current plan activities | No source snapshots, private rationale/evidence, vocabulary deck or recipient edits |

All raw transcripts, evidence quotes, media, identity/security data, learner
exports and exam feedback are outside the first scope. Existing reports/plans
contain copied evidence: a future sharing projection must allowlist fields and
omit those copies and references, not reuse an entire existing response. Enabling
source quotes, new scope types, exam results or prospective time windows needs a
new reviewed scope/disclosure and a fresh affirmative consent. Source checks
still determine whether summaries are current; “summary” does not make data public.

## Explicit learner consent and visibility

A grant must be separate from provider-processing consent and signed-in account
creation. The adult learner sees the verified recipient identity, relationship
label, exact fields/items/revisions/time interval, purpose, expiry and copy
limitations; previews exactly what the recipient can read, then affirmatively
confirms.
No default acceptance, bundled consent, pressure to share to use practice, inherited
school/family entitlement or email-domain trust. Verification of recipient identity
and any invitation acceptance requires a future reviewed identity flow; a
possession-only link must never serve as a learner-data credential.

Invitations are pending without access. An accepted invitation still provides no
access until the learner approves the verified identity and disclosure. A recipient
cannot activate, expand, renew or restore a grant. The future model needs bounded
expiry chosen by the learner; a mandatory maximum duration and renewal reminder
policy are open gate S2. Unknown/missing expiry fails closed. Item/time/scope
expansion, recipient change and expired/revoked renewal need a new consent;
restricting scope is immediate. No implicit access to later reports, plan revisions
or items. Fixed-period summaries may be recalculated only from eligible data
within the disclosed scope; they never acquire a prospective time window.

The learner can always inspect active, pending, expired and revoked relationships,
recipient identity, selected fields/items/period, purpose, consent/disclosure
version and dates, expiry, last recorded access and scope changes. Use understandable
Spanish copy and an exact recipient-view preview. Learners can revoke one grant
or all grants without contacting a teacher, family member or operator. Shared
views state source freshness and stop offering evidence drill-down they cannot
access. Consent withdrawal must not disable private practice.

## Proposed permissions, not current roles

| Actor | Future permission boundary |
| --- | --- |
| Learner owner | Own existing learner resources; create/restrict/revoke own grants, preview projections and see own sharing audit history |
| Teacher recipient | Read only this learner's expressly granted current projection while the grant is active; no feedback edits, plan assignment, deletion/export or onward sharing |
| Family recipient | Same read-only boundary; no inferred guardian power or control of the learner account |
| Another learner or recipient | No access unless separately named in a valid grant; grants to one recipient never apply to others |
| Operator/support | No teacher/family access through employment or operational privileges; no content-browser or impersonation permission introduced |
| Background projection/delivery job | Not a recipient; perform only a currently authorized, account-scoped effect with source/grant revalidation, never mint access |

No global “teacher can read learners” rule, list of unshared learners, student
search or membership-based authorization. Shared responses must not reveal whether
an unauthorized learner/resource exists. The owner alone can change goals, issue
dismissals, cards/plans, account details, processing consent or privacy jobs.
A recipient's rights to their own account do not extend to the learner's account.

## Authorization and account isolation

Every future read/delivery checks both active accounts, the verified recipient,
exact learner/grant binding, grant state/expiry/version, scope membership and
source eligibility using canonical server state and the validated server session.
Client-supplied IDs/identity claims, relationship labels, model suggestions and
provider claims cannot establish ownership. An
owner resource path remains owner-only; a granted summary does not open the
original report/transcript/stream/export path. Cache hits and retries apply the
same checks. Fail closed on unavailable canonical authorization state.

Cross-account sharing will require a deliberately separate projection boundary
without relaxing existing repositories' ownership predicates. Review ADR 0007's
multi-user RLS trigger and prove application plus database isolation before any
implementation acceptance. A future database decision must preserve foreign-key
and account boundaries, pooled-connection isolation and migration/runtime
privileges; no RLS policy or schema change is selected or added here.

Caches, cursors, background jobs and temporary projections must bind learner,
recipient, grant version and scope. No global aggregate cache, client-supplied
owner substitution, public CDN cache or content-bearing notification. Do not
retain a second learner-data collection owned by the recipient. Validate the
[two-account matrix](m12-test-matrices.md#two-account-isolation-cases) at all
entry points before enabling a future feature.

## Revocation, concurrency and copies

Proposed revocation semantics: the canonical revocation commit is the effective
boundary. Any authorization decision after that commit denies access, including
already logged-in recipients, existing tokens/cursors, cached views and queued
work. Cancel active shared deliveries and recheck authorization before each new
chunk/handoff; previously authorized bytes already in transit cannot be recalled.
Do not advertise instant erasure of content already viewed or downloaded outside
the service. The first slice prohibits service-provided shared downloads, but
cannot prevent screenshots or manual copying; disclose this before consent.

Revoke/expiry/restrict invalidate projections and prevent future deliveries.
Pending work must recheck grant version at publish time; a job/cursor created
before revocation cannot recreate an active grant or cached content. Grant renewal
creates a distinct affirmative authorization; stale versions do not regain access.
Retries and concurrent revokes converge, without an acknowledgement before the
canonical effect. Test commit/delivery interleavings and transport buffering,
including offline clients: clear local shared data on reconnect/rejection; never
support offline recipient storage in the first slice. Any permitted client cache
lifetime and stream termination bound must be demonstrated at S3, not assumed.

## Auditability and minimization

A future restricted sharing audit records learner/recipient references, grant and
scope/version, actor, action, authoritative time, result and correlation reference
for invite/consent/activation/read/scope-change/revoke/expire/delete. No learner
text, prompts, raw email, token, IP/device fingerprint or secrets. Record successful
access and authorization-relevant denials without letting an attacker enumerate
accounts. A successful shared delivery requires a durable audit effect; an audit
failure fails closed rather than silently delivering unrecorded content.

This audit is access-controlled personal data, separate from content-free
operational telemetry (M10 logging currently excludes account IDs). Learners see
their own sharing history; recipients do not see other recipients or unrelated
learner audits. Tamper resistance, failure/retry semantics, access/read volume,
maximum retention, deletion/anonymization and any legal exception are unresolved
S4 gates. Do not invent indefinite retention or compliance certification.

## Revocation, deletion, retention and export lifecycle

Learner account deletion immediately disables all grants/deliveries and prevents
in-flight resurrection; subsequent cleanup covers grants, projections, invitations
and audit personal data under an approved policy. Recipient account deletion
immediately disables grants to that recipient and cleans their relationships;
it must not delete or modify the learner's source practice state. Disabling either
account denies access even if a grant is otherwise active. Restores must replay
both account-deletion and sharing-revocation restrictions before reopening traffic;
M10 account tombstones alone do not prove future grant revocations survive restore.

Source deletion/90-day expiry invalidates affected shared feedback/evidence and
projections/temporary artifacts, rebuilding only from surviving eligible state.
Existing retained structured progress may remain under ADR 0016; sharing cannot
extend source retention or fabricate replacements. Learner-controlled confirmed
cards retain their current M10 behavior; sharing does not expose them by default.

The future learner export should include their own exam attempts/feedback (if that
separate mode exists), grants, consent changes, revocations and allowed audit
history via an explicit allowlist. Recipient identifiers in that export need S4
privacy review; no recipient credentials or unrelated personal data. Current
exports are unchanged. Recipient account exports may describe their relationship
records once approved but never embed learner reports, transcripts, progress or
learner exports. Exports must use consistent snapshots, account ownership,
expiry/size bounds and deletion fencing. Revocation removes hosted shared artifacts;
learner-owned private exports remain subject to their existing lifecycle.
An already downloaded owner's export or screenshot cannot be recalled.

## Minors and unresolved gates

Adult-only is a proposed admission limit, not verified age or legal advice.
Before any minor is involved, resolve jurisdiction and age thresholds, reliable
age/guardian verification, lawful basis, guardian authority/custody conflicts,
learner assent and understanding, who may grant/revoke, safeguarding/coercion,
coming-of-age transition, retention and deletion/export rights. Family labels and
existing consent cannot answer these questions. Unknown age/authority blocks
sharing; no guardian login or parent entitlement is introduced. Even adult sharing
requires privacy, identity, security, accessibility and release review.

See gates S1–S5 and proposed slices S-A–S-E in [M12 discovery](m12-discovery.md).
No real recipient, legal approval, authorization policy or live sharing behavior
is established by M12.
