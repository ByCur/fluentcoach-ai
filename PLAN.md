# FluentCoach AI — Incremental delivery plan

Implementation proceeds sequentially in focused, reviewable milestone PRs; split
a milestone further if its criteria cannot be demonstrated together. Completed
and in-progress work is recorded in each milestone's status and repository history.

## Command and completion conventions

Commands for completed milestones are executable contracts. Later milestones add
their named suites as part of their implementation before running them. Do not
create empty success scripts. Required suites fail on zero collected tests.

M01 onward, common gates are `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`,
`pnpm build`. Integration tests use isolated migrated PostgreSQL/Redis and
synthetic data. Live AI checks require explicit credentials and must remain
within verified free quotas; paid calls are forbidden for the initial pilot.

Completion requires demonstrated acceptance, passing required checks, updated
documentation and recorded limitations. Fake-AI tests do not establish live
educational quality. Skipped gates do not count as complete. Resolve SPEC.md
decision gates before their affected work, especially real learner access.

## M00 — Decisions and feasibility

**Status: architecture/decision complete (2026-09-29); live feasibility
validation deferred.** Architecture decisions are recorded in ADRs 0002–0005.
Credentialed provider behavior and physical-device feasibility are now formally
M05/M06 entry gates; ADR 0005 replaces initial paid-capable deployment with a
strict EUR 0/month release gate.

- **Objective:** Resolve decisions that could invalidate implementation.
- **Scope:** Learner/device/age assumptions, budget, identity/hosting selection,
  stack compatibility, zero-cost/free-tier feasibility assessment, and ADRs for
  transport, provider capabilities, retention and deployment.
- **Acceptance criteria:** Named initial provider/transport and fallback with
  documented evidence and limitations; device matrix and budget limits; decision
  owners recorded; live validation assigned to M05/M06; no real-data use with
  unresolved age/privacy gates.
- **Required checks:** Repository compatibility/boundary checks and manual review
  of the decisions, official-document references, assumptions, and deferred-gate
  ownership. No credentialed provider test is claimed as an M00 result.
- **Validation commands:** Run the implemented M01 documentation-adjacent gates
  (`pnpm lint`, `pnpm typecheck`, `pnpm test:boundaries`, `pnpm build`); exact
  research commands/results and deferred live spikes are in ADR 0002.
- **Out of scope:** Production application, real learner data, paid provisioning,
  multiple complete commercial adapters.

## M01 — Foundation and executable quality gates

- **Objective:** Reproducible development before product behavior.
- **Scope:** Pinned pnpm/TypeScript workspace; web/API/worker shells; dependency
  boundaries; Docker/Compose; PostgreSQL/Redis; startup config validation,
  including the future `BILLING_MODE`;
  `.env.example`, ignores, README, CI, health/readiness and contract conventions.
- **Acceptance criteria:** Documented fresh-clone startup works; configuration
  fails clearly and safely; no committed secrets; CI runs checks and image build;
  domain cannot import infrastructure/frameworks.
- **Required tests:** Config validation/redaction, health/readiness behavior,
  import boundary checks and container smoke.
- **Validation commands:** `pnpm install --frozen-lockfile`, common gates,
  `pnpm test:boundaries`, `docker compose config --quiet`,
  `docker compose up --build -d`, `pnpm test:smoke`.
- **Out of scope:** Product auth, tutoring, AI calls, cloud deployment,
  speculative learner tables.

## M02 — Identity and learner setup

**Status: implementation and PostgreSQL/browser gates pass locally (2026-09-29), but M02 is not marked complete until the required Docker Compose gate runs in a daemon-capable environment. Auth0 Free tenant provisioning remains a later deployment gate recorded in ADR 0006.**

- **Objective:** Persist an isolated learner profile.
- **Scope:** Invitation-only OIDC, secure server sessions, profile/goal/consent
  entities and migrations, Spanish-first onboarding, A1–B2/timezone preferences,
  ownership enforcement and RLS decision.
- **Acceptance criteria:** Preferences survive logout; invalid levels rejected;
  unauthorized access and cross-account reads/writes denied; cookie/CSRF controls
  verified; consent policy versions saved.
- **Required tests:** Auth lifecycle, profile rules, two-account guessed-ID
  attacks, CSRF, empty-database migrations and onboarding E2E.
- **Validation commands:** Common gates, `pnpm db:migrate:test`,
  `pnpm test:integration:identity`, `pnpm test:e2e:onboarding`.
- **Out of scope:** Public signup, custom passwords, family roles,
  AI level assessment, conversations. Auth0 Free capability verification and the
  versioned Gemini Free data-use disclosure/consent are required design inputs;
  do not implement M02 as part of ADR 0005.

## M03 — Deterministic text vertical slice

- **Objective:** Prove tutoring/session workflows without live AI.
- **Scope:** Six versioned scenarios, session/turn/events, conversation port and
  fake adapter, streamed text UI, two modes, Spanish help, history/end.
- **Acceptance criteria:** All scenarios/levels selectable; snapshots persist;
  scripted modes differ correctly; help returns to English; repeated turns/end
  are harmless; history survives reload; stream reconnect resumes from cursor.
- **Required tests:** Session state machine, mode/help policy, ordering/dedup,
  terminal immutability, stream ownership, keyboard and conversation E2E.
- **Validation commands:** Common gates, `pnpm test:integration:sessions`,
  `pnpm test:contract:ai`, `pnpm test:e2e:conversation`.
- **Out of scope:** Real AI, voice, analysis reports, adaptive features.

## M04 — Durable background execution

- **Objective:** Reliable, recoverable processing after session end.
- **Scope:** Outbox, analysis state, transport-neutral job port, QStash-signed
  idempotent API endpoints, transcript finalization/revisions, bounded retry/leases,
  PostgreSQL reconciler, provider-run records, queue metrics and fake job. Keep
  BullMQ/worker as a future adapter; do not require it in the free pilot.
- **Acceptance criteria:** End/outbox commit atomically; repeated delivery and
  API/job restart produce one persistent effect; QStash/Redis loss recoverable;
  failures inspectable; empty and partial sessions explicitly handled.
- **Required tests:** Rollback, crash after provider response, duplicate jobs,
  late turns/revisions, exhausted retries and queue outage/reconciliation.
- **Validation commands:** Common gates, `pnpm test:integration:jobs`,
  `pnpm test:resilience:jobs`.
- **Out of scope:** Real analysis content, issue trends, voice.

## M05 — Real text tutor and automatic reports

- **Objective:** Useful live tutoring and evidence-backed feedback.
- **Scope:** One real conversation/analyzer adapter, versioned prompts/schema,
  validation/evidence checks, deadlines/cancellation, budgets, report UI and retry.
- **Entry gate:** With synthetic content and an owner-approved free-tier
  credential, verify `gemini-3.8-flash` remains a current Free-Tier candidate,
  verify its limits/data terms and valid/invalid structured output, and exercise
  application evidence rejection, reported usage and latency. Record the model,
  prompt and schema versions; do not treat the M00 desk assessment as this test.
- **Acceptance criteria:** Reports cite actual learner turns; invalid evidence
  rejected; modes/help pass live rubric; provider failures are visible/recoverable;
  routine CI needs no paid provider.
- **Required tests:** Adapter contracts, malformed/adversarial output, fabricated
  evidence rejection, cost caps, report E2E and reviewed level/mode/scenario eval.
- **Validation commands:** Common gates, `pnpm test:contract:ai`,
  `pnpm test:integration:analysis`, `pnpm test:e2e:reports`,
  `pnpm eval:ai -- --suite pilot-text --billing-mode free_only` (opt-in, free
  quota only).
- **Out of scope:** Voice, recurring trends, automatic CEFR promotion,
  second commercial provider.

## M06 — Real-time voice experience

- **Objective:** Usable spoken practice on agreed devices.
- **Entry gate:** Run the ADR 0005 Gemini Live spike with synthetic speech: verify
  `gemini-3.8-live` remains a current Free-Tier Live candidate, ephemeral-token
  scope/expiry and the direct browser WebSocket architecture, or measure the
  minimum secure API WebSocket relay; verify event authority, interruption,
  reconnect, latency and quota behavior. Failure leaves voice unavailable with
  text fallback; it never permits key exposure or spend.
- **Scope:** Chosen voice transport/adapter, scoped credentials, microphone,
  captions/playback, mute/stop/interruption, reconnect, authoritative event
  normalization, text fallback and server-enforced session limits.
- **Acceptance criteria:** Spoken sessions in both modes produce history/report;
  browser has no permanent AI key; interrupted output is not marked delivered;
  actual devices pass; latency measured with sample sizes; expiry stops media.
- **Required tests:** Permission denial, fake-audio browser flows, disconnects,
  duplicate/out-of-order events, expired credentials, cross-account media denial,
  live device/interruption evaluation.
- **Validation commands:** Common gates, `pnpm test:contract:voice`,
  `pnpm test:e2e:voice`, `pnpm test:resilience:voice`,
  `pnpm eval:voice -- --billing-mode free_only` (opt-in, free quota only);
  manual device checklist.
- **Out of scope:** Pronunciation scoring, recordings, telephony, native apps.
  Real learner access still requires M10/M11 release/privacy gates.

## M07 — Recurring learner issues

- **Objective:** Evidence-based persistent priorities.
- **Scope:** Versioned taxonomy, observations/aggregates, recurrence threshold,
  dismissal, current-report-only counting and rebuilds.
- **Acceptance criteria:** Recurrence needs the specified distinct-session
  threshold; evidence is visible; reanalysis/dismissal/retention/deletion update
  counts without duplication.
- **Required tests:** Threshold/time boundaries, duplicate/concurrent analysis,
  rejected evidence, dismissal/rebuild and account isolation.
- **Validation commands:** Common gates, `pnpm test:integration:issues`,
  `pnpm test:e2e:issues`.
- **Out of scope:** Psychological profiling, CEFR changes, pronunciation
  inference, generated plans.

## M08 — Vocabulary and spaced repetition

- **Objective:** Turn useful language into reviewable learning material.
- **Scope:** Contextual suggestions/confirmation, phrase/sense deduplication,
  cards, versioned deterministic scheduler, due queue, ratings/history.
- **Acceptance criteria:** Only confirmed entries schedule; due dates follow
  documented rules; duplicate/concurrent reviews advance once; scheduling is
  reproducible from recorded state and algorithm version.
- **Required tests:** Scheduling fixtures, time boundaries, sense dedup,
  stale versions, repeated reviews, ownership and review E2E.
- **Validation commands:** Common gates, `pnpm test:integration:reviews`,
  `pnpm test:e2e:vocabulary`.
- **Out of scope:** Shared decks, offline sync, dictionary scraping,
  claims of proven optimal retention.

## M09 — Plans, goals and progress

- **Objective:** Convert learning evidence into manageable practice.
- **Scope:** Plan generator/activities, practice events/aggregates, minutes,
  sessions/goals, speaking streaks, review activity and evidence-linked trends.
- **Acceptance criteria:** Plans use valid activities/evidence; accept/skip/
  refresh work; one active plan; text separated from speaking; idle excluded;
  historical local dates stable; insufficient-data states shown.
- **Required tests:** Invalid references, no-history fallback, idempotent events,
  DST/midnight/timezone changes, streak breaks, concurrent plan refresh and rebuild.
- **Validation commands:** Common gates, `pnpm test:integration:plans`,
  `pnpm test:integration:progress`, `pnpm test:e2e:progress`,
  `pnpm eval:ai -- --suite plans --billing-mode free_only` (opt-in, free quota only).
- **Out of scope:** Official proficiency scores, leaderboards, push alerts,
  exam practice and third-party dashboards.

## M10 — Privacy lifecycle and operational hardening

- **Objective:** Close real-data and recovery risks before pilot.
- **Scope:** Export/deletion/retention jobs, in-flight deletion protection,
  sanitized telemetry/alerts, limits, secret/dependency/image scans, critical
  accessibility, load/failure checks and restore procedure.
- **Acceptance criteria:** Exports isolate accounts; deletion removes derived
  state and prevents resurrection; retention is repeatable; logs contain no
  fixture secrets/content; caps enforced; load targets measured; critical
  accessibility failures resolved.
- **Required tests:** Two-account export/delete, deletion during analysis,
  tombstone replay, retention clock boundaries, redaction, provider outages,
  five-session load and accessibility checks.
- **Validation commands:** Common gates, `pnpm test:integration:privacy`,
  `pnpm test:security`, `pnpm test:a11y`, `pnpm test:load`,
  `pnpm test:resilience`; documented restore drill.
- **Out of scope:** Compliance certification, public signup, multi-region
  failover, unbudgeted production provisioning.

## M11 — Deployment and private learner pilot

- **Objective:** Operate the tested product with recovery paths.
- **Scope:** ADR 0005 free services, production isolation, secrets, immutable builds,
  controlled migration, gated release, available free backup/alerts,
  pilot onboarding and learner feedback.
- **Acceptance criteria:** Every free tier/term/limit is re-verified; deployment
  requires no billing; `BILLING_MODE=free_only` rejects billable configuration;
  no worker is deployed; cold-start, QStash-pending, Redis-loss and quota behavior
  are exercised; provider data use/consent is verified; learner completes the
  available voice-or-text -> report -> review -> plan path.
- **Required tests:** Deployment smoke, previous-schema upgrade, compatible image
  rollback, active-session draining, backup restore, budgeted synthetic prod probe.
- **Validation commands:** `pnpm test:migrations`, `pnpm test:smoke:staging`,
  `pnpm test:smoke:production` after authorized release; provider-specific
  deployment/rollback commands documented when hosting is selected.
- **Out of scope:** Public launch, scaling beyond measured needs, payments,
  exam and teacher/family modes.

## M12 — Future-mode discovery only

- **Objective:** Scope exam practice and teacher/family dashboards.
- **Scope:** Exam/rubric choice, content rights, revocable sharing, role access,
  learner visibility and age/consent requirements.
- **Acceptance criteria:** Separate reviewed specs and small follow-up milestones;
  no implicit third-party learner access.
- **Required tests:** Define exam evaluation fixtures and role/revocation test
  matrix before any future implementation.
- **Validation commands:** Manual document/decision review; future feature
  commands belong to a separately accepted implementation plan.
- **Out of scope:** Implementation of either future mode under this plan.

## Release cuts and traceability

- Internal text demo: M00–M05, synthetic data.
- Voice capability demo: M06, synthetic data/device evaluations.
- Adaptive feature set: M07–M09.
- First learner pilot: M10–M11. For an earlier pilot, move complete privacy and
  operational gates ahead of optional adaptive features, never omit them.
- Future expansion: M12 discovery then a separate plan.

| Requirements | Milestones |
| --- | --- |
| F01 profile/goals | M02, M09 |
| F02–F05 scenarios, levels, modes, help | M03, M05, M06 |
| F06 voice | M00, M06 |
| F07–F08 history/reports | M03–M05 |
| F09 recurring errors | M07 |
| F10 plans | M09 |
| F11–F12 vocabulary/repetition | M08 |
| F13 analytics/streaks | M09 |
| F14 ownership/privacy | M02 throughout, M10 gate |
| F15 future modes | M12 |

Docker, type safety, modularity and CI start at M01. Production deployment in
M11 does not postpone secure defaults, validation or telemetry hooks until then.
