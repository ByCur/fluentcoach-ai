# M12 discovery — Test matrices before future implementation

Status: **Specified, not implemented or executed.** Date: 2026-10-06.
These are future acceptance contracts, not passing test results, executable
fixtures, new scripts or authorization to implement. See [exam spec](m12-exam-practice-spec.md),
[sharing spec](m12-learner-sharing-spec.md) and [gates](m12-discovery.md).

Use only synthetic accounts/content, a fixed trusted clock, deterministic fake
providers and explicit adversarial inputs. Future integration gates use real
PostgreSQL/Redis for transactions/isolation; browser flows use fake AI/speech.
Assert both the denied effect and absence of leaked payload, cached copies,
unauthorized writes, source IDs and resurrection. Missing services/fixtures or
zero tests must fail the eventual suites. Existing ownership tests remain required.

## Exam evaluation fixture matrix

Core pack: **48 fixtures = 4 selected learning targets (A1/A2/B1/B2) × 3 original
task types × 4 response conditions**. Every future cell must have independently
human-reviewed expected evidence/anchors; a selected level does not assert
assessed CEFR.

| Axis | Values | Required observations |
| --- | --- | --- |
| Learning target | A1, A2, B1, B2 | Task wording and feedback suitability; no level reclassification or score conversion |
| Task type | Short functional written response; longer connected written response; transcript-only spoken response | Applicable four rubric dimensions; spoken transcript explicitly excludes acoustic judgments |
| Response condition | Criterion-consistent response; partial/task-missing response; grammar/lexical limitations; empty/too-short/ambiguous response | Per-dimension accepted anchors/ranges, exact positive/negative spans, omissions grounded in task, insufficient-data where needed |

Each core fixture includes synthetic task/response, authorship/rights provenance,
allowed-help context, task/rubric/evidence/fixture versions, response revision,
expected accepted/rejected dimensions and spans, prohibited claims, expected
abstention and review rationale. Short-response insufficiency is dimension-specific:
a short valid answer can fulfill a task while giving too little range evidence.
Do not equate an empty answer with low proficiency. Include acceptable variants
and anchor-boundary examples across the pack.

Add **20 adverse fixtures**, one minimum for each row below; total minimum 68.
Overlapping core cases do not replace these named adverse cases. Future additions
for branded families or reading/listening must extend the pack with separate
reviewed coverage before those tasks are enabled.

| ID | Adverse fixture/input | Required expected result |
| --- | --- | --- |
| X01 | Request for an official IELTS/TOEFL/Cambridge score, pass guarantee or CEFR certificate | Practice-only notice; no official score/claim |
| X02 | Response/task contains evaluator prompt injection | Treat as data; no policy override or content leakage |
| X03 | Fabricated quote, invalid span or mismatched response revision | Reject affected evaluation; no apparently complete feedback |
| X04 | Tutor/help/task-source text presented as learner-performance evidence | Reject evidence; no learner finding from it |
| X05 | Foreign learner attempt/evidence ID | Deny without revealing foreign data; no derived write |
| X06 | Learner deletes account during evaluation | Late result cannot persist, cache or deliver |
| X07 | Source removed/expired during evaluation | No stale evaluation or copied evidence published |
| X08 | ASR ambiguity or transcript requests pronunciation/intonation scoring | Abstain on ambiguous criteria; no acoustic inference |
| X09 | Spanish help/coached response | Mark assisted practice; never label independent exam performance |
| X10 | Truncated/interrupted/time-limited response | Show limitation/insufficient evidence; no invented completion |
| X11 | Acceptable dialect or valid alternative wording | No incorrect correction or dialect penalty |
| X12 | Accurate short response with little range evidence | Distinguish task fulfillment from insufficient range evidence |
| X13 | Expired/unknown content rights or learner-uploaded past paper | Task blocked; restricted material not evaluated or copied |
| X14 | Stale exam-format/task/rubric version | Block unsupported task; preserve provenance, no silent rubric migration |
| X15 | Malformed model output, unknown dimension, out-of-range anchor | Reject; no unchecked assessment applied |
| X16 | Duplicate job/delivery/evaluation retry | One accepted logical effect; no duplicate report or inflated evidence |
| X17 | Evaluator timeout/provider unavailable/free quota exhausted | Explicit unavailable/retry state; no invented result or paid fallback |
| X18 | Model asks to overwrite selected level or feed score into plan | No unauthorized profile/plan/priority mutation |
| X19 | Rubric/model/prompt update produces unstable anchors across three runs | Record disagreement; fail unresolved pedagogical gate, no calibration claim |
| X20 | Injection attempts to leak response/prompt/secret into telemetry | No content or secrets in logs; bounded content-free result |

Future CI: all policy/evidence cases pass; no fabricated evidence, foreign access,
official-score claim or resurrection. Future live/local model review: three runs
per admitted pedagogical fixture (minimum 144 evaluations for the 48 core cases),
plus reviewed safe adverse-response cases, version/cost metadata, independent
reviewer rationales and a held-out subset. Rights, ownership, deletion and malformed
input cases that must fail before inference remain deterministic boundary tests;
never invoke a model on blocked content just to complete an evaluation count.
Provisional useful-feedback threshold and anchor tolerances are gates E2/E4; fake success proves neither live
quality nor psychometric validity. If quotas/review limits prevent completion,
record incomplete, never passed.

## Role/access matrix

All entries describe proposed future permissions. **Deny** is the current behavior
for any third party. “Scoped” requires active learner + active recipient + exact
current grant + selected items/fields + eligible sources under M10 (retained
structured progress may outlive transcripts). Test teacher and family independently;
the role label alone grants nothing.

| Operation | Learner owner | Named teacher with grant | Named family with grant | Unrelated learner/recipient | Operator via dashboard | Anonymous |
| --- | --- | --- | --- | --- | --- | --- |
| Read own original practice/report/transcript | Existing owned access | Deny learner originals | Deny learner originals | Deny | Deny | Deny |
| Read selected shared progress/feedback/plan projection | Own preview | Scoped | Scoped | Deny | Deny | Deny |
| Read unselected items, quotes, deck or exam feedback | Own eligible data | Deny | Deny | Deny | Deny | Deny |
| Enumerate/search unshared learners or other recipients | No such directory | Deny | Deny | Deny | Deny | Deny |
| Create/expand/renew/restrict/revoke learner grant | Own only, expansion/renewal needs new consent | Deny | Deny | Deny | Deny | Deny |
| View sharing consent/recipient list/audit | Own only | No learner audit/list | No learner audit/list | Deny | Deny | Deny |
| Edit learner profile/goals/plans/cards/dismissals | Existing owned access | Deny | Deny | Deny | Deny | Deny |
| Export/delete learner account or source | Existing owned access | Deny | Deny | Deny | Deny | Deny |
| Download original learner export or shared artifact | Existing owned export only | Deny | Deny | Deny | Deny | Deny |
| Onward sharing, public link or recipient grant delegation | No such first-slice operation | Deny | Deny | Deny | Deny | Deny |

A recipient can manage their own independent account under existing ownership
rules. Those rights must never be interpreted as learner-account authority.
Infrastructure access is not redesigned by this matrix or made a dashboard role.

## Consent/revocation matrix

For every row inspect learner preview, recipient response, canonical grant state,
queued work, audit and caches. Use fixed-time expiry boundary cases; deliberately
pause authorization/publish to reproduce races without probabilistic sleeps.

| ID | State/action | Expected result |
| --- | --- | --- |
| C01 | No consent, prior AI-processing consent, role label or shared email domain | No third-party access; private practice still works |
| C02 | Invitation pending or accepted but identity not learner-approved | No data or resource existence leaked; link alone never authorizes |
| C03 | Adult learner affirmatively approves verified recipient, exact scope/period and bounded expiry | Only selected projection visible; owner preview matches allowed fields |
| C04 | Forged consent, recipient activation or grant expansion | Reject; unchanged scope/state; authorization-relevant audit |
| C05 | New report, plan revision, scope type or expanded period | Not silently included; scope expansion needs new disclosure/consent |
| C06 | Learner restricts scope concurrently with read | Later authorization cannot include removed fields/items; invalidate stale projection |
| C07 | Revoke one grant while other grant remains | Revoked recipient denied; other grant retains only its own allowed scope |
| C08 | Revoke all; repeated/concurrent revoke or lost acknowledgement | Converges idempotently; owner sees canonical result; no implicit renewal |
| C09 | Clock immediately before / at / after expiry | Before: scoped; at and after: denied (expiry must be strictly greater than server now) |
| C10 | Read authorized before revoke, new authorization after commit | Previously transmitted bytes cannot be recalled; later authorization denied |
| C11 | Stream/page/cursor/cache/queued job created before revoke | Recheck before new handoff/chunk/publish; cancel delivery and discard stale versions |
| C12 | Recipient logged in during revoke or either account disabled | Login/token TTL does not extend grant; next authorization denies |
| C13 | Renew revoked/expired grant | Fresh affirmative consent and distinct version; old cursor/job remains denied |
| C14 | Canonical authorization or audit store unavailable | Fail closed, no unaudited delivery; content-free operational failure |
| C15 | Missing expiry, unknown age or unverified guardian authority | No activation; unresolved gate shown to owner without granting access |
| C16 | Consent/disclosure changed materially | No expansion under old version; require new consent for the affected scope |
| C17 | Restore old database/cache after revoke | Traffic remains blocked until revocation state replayed; no grant resurrection |
| C18 | Offline recipient reconnects or concurrent browser tabs | Reject stale grant; clear service-controlled shared data; no offline recipient store |
| C19 | Audit success/read retry, denied read, audit write failure | Trace successful access without learner content; retries identifiable; failure denies delivery |

## Two-account isolation cases

Use learner A and independent account B. First run every case with **no grant**;
then grant B one exact A summary and repeat. B may be an independent learner as
well as a proposed recipient. Add recipient C solely to prove recipient binding.
For each transport/path, compare missing vs foreign IDs to avoid enumeration.

| ID | Attempt | Expected result |
| --- | --- | --- |
| I01 | B substitutes A account/profile/session/report/plan/card IDs in own operations | Denied, no A fields or mutation; granting a summary never opens owner paths |
| I02 | B uses A export job/download/delete/source-delete IDs or request keys | Denied; A privacy state intact; B export includes no A learner content |
| I03 | B calls an A projection without grant, then with one-item grant | First denied; then only exact selected summary, no raw quotes/source URLs |
| I04 | B uses grant for A item 1 to access A item 2/unselected date/metric | Denied, no permissive fallback or counts/existence leakage |
| I05 | C replays B invitation/cookie-independent grant ID/cursor | Identity mismatch denied; no onward access |
| I06 | B changes owner/recipient/scope in request or provider/job envelope | Untrusted fields rejected; canonical identity/binding used |
| I07 | B reads A transcript/SSE/voice token/report-evidence URL linked by a summary | Denied at original boundary; no implicit drill-down |
| I08 | Alternating A/B requests use pooled DB connections, cache keys or queued work | No retained owner/grant context; missing context denies; values never cross accounts |
| I09 | B lists/searches/counts resources, audits, recipient relationships or aggregates | Only B-owned or exact granted projection; no A directory or other recipients |
| I10 | A deletes/revokes/retains source while B delivery or exam evaluation runs | No stale publication or recreation; B-owned learner state unchanged |
| I11 | Delete B as recipient, then recreate a new account with same email/label | Old grant remains unusable; new identity needs new learner authorization; A source remains |
| I12 | Missing/forged session, expired grant, failure/retry and restore replay | Fail closed consistently; neither Redis loss nor restore broadens access |

No nominal RLS test can substitute for application/transport isolation. Any future
RLS implementation also needs non-owner runtime-role and pooled-context tests.

## Deletion/export effects

Existing M10 behavior remains authoritative; new rows are extensions for a
separate plan. Assert surviving unrelated-account data as well as removed data.

| ID | Event | Future expected effects |
| --- | --- | --- |
| D01 | Learner A starts account deletion | Immediately deny all A shared/private access; fence jobs; revoke grants and invalidate artifacts; cleanup all A future-mode state under approved audit policy |
| D02 | Recipient B starts account deletion | Deny B access to all grants; remove recipient relationships/projections; preserve A learner source and unrelated recipient access |
| D03 | A deletes a selected source or it expires at the current 90-day rule | Remove source-linked exam/shared feedback and copied evidence; invalidate projections/temporary exports; never extend retention because it was shared |
| D04 | Retention cutoff before / exactly equal / after source timestamp | Preserve existing strict older-than cutoff; eligible structured progress can remain, quotes/source feedback cannot |
| D05 | A exports while grants/revokes/source changes occur | Consistent owned snapshot, reviewed relationship/consent/audit allowlist; no secrets/unrelated recipient data; no mixed-version snapshot |
| D06 | B exports own account | Only B-owned data and approved relationship metadata; no A learner content or A export artifact |
| D07 | Revoke sharing after learner-owned export; attempt shared download | Hosted shared projections denied/removed; no shared download facility; own export follows existing owner-only lifecycle, no promise to recall downloaded copies |
| D08 | Deletion/retention races with export generation/download | No new forbidden artifact, invalidate affected temporary copies; recheck active account/source fencing |
| D09 | Restore backup with old active grants, deleted sources or completed accounts | Replay deletion and grant restrictions while isolated; verify A absent/revoked and unrelated B intact before traffic |
| D10 | Audit retention/anonymization deadline or lawful exception | Apply approved S4 policy; no indefinite identifiable record, no learner text; open policy blocks real-data release |
| D11 | Rights for task content expire/revoke | Disable affected tasks/evaluations; follow approved lawful purge/export policy E3, no unauthorized redistribution |
| D12 | Late provider result, duplicate worker, stale grant-version effect | Cannot recreate deleted attempts/feedback, active grants or cached learner projections |

## Evidence required from a later implementation

Record per-case outcome, code/fixture/policy versions, synthetic accounts, clock
boundaries, failed interleavings and suite counts. Real DB tests prove the commit
and replay behavior; browser checks prove preview/consent/revoke visibility,
Spanish copy, keyboard/focus/status and cache cleanup. Independent pedagogical
review proves only the stated practice-feedback scope. Legal/age/provider and
M10/M11 release gates remain separate. No suite named here exists because of M12.
