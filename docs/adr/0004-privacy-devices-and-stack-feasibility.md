# ADR 0004: Privacy, devices, and stack feasibility

> **Amended by ADR 0005.** Application retention/device decisions remain. Its
> OpenAI-specific provider-data analysis is historical for the initial pilot;
> Gemini Free's model-improvement and human-review tradeoff now governs.

- **Status:** accepted targets; real-data and physical-device gates remain
- **Date:** 2026-09-29
- **Decision owners:** product owner (learner/privacy facts) and technical owner
- **Scope:** M00 retention, device, and M01 compatibility review

## Data and privacy decision

No application component stores raw audio by default. Browser audio is sent only
to the selected realtime provider for the active connection and is not copied to
PostgreSQL, Redis, object storage, logs, traces, or fixtures. Debug recording is
off and cannot be enabled for real learner speech without a new consent,
retention, access, and deletion decision.

Retain final transcripts, session events and reports for **90 days** initially.
Retain learner-approved structured state (profile, confirmed vocabulary, review
state and current evidence-backed priorities) until account deletion or an
applicable source-deletion rule removes/rebuilds it. Redis queues/session/cache
have bounded TTLs and are not canonical retention. Telemetry is content-free and
retained no longer than 30 days. Exports expire after 24 hours. Backups must have
a documented finite window (target at most 35 days) and deletion tombstones must
be replayed after restore. These are application targets to confirm with the
learner before pilot, not consent already obtained.

This **application-state retention** is independent of OpenAI response storage.
Ordinary Responses API tutoring and analysis calls set **`store: false`**, so the
application does not ask OpenAI to retain response objects for later retrieval.
That setting does not disable or shorten separate provider **abuse-monitoring
retention**. **Zero Data Retention (ZDR)** and **Modified Abuse Monitoring (MAM)**
are provider controls with their own eligibility, endpoint/model compatibility,
and contractual configuration; they must be verified rather than inferred from
`store: false`.

Account deletion first disables access, terminates realtime/provider sessions,
cancels queued work, and establishes a deletion epoch. It then purges transcripts,
reports and derived state, prevents late jobs from resurrecting data, expires
exports, and records only a content-free tombstone needed to reapply deletion to
a restore. Provider-side deletion is separate: use supported deletion endpoints
where applicable and document any independent provider safety/legal retention.

OpenAI states API data is not used for model training by default and documents
retention controls and regional data handling in its
[API data controls](https://developers.openai.com/api/docs/guides/your-data).
That does **not** establish zero retention or EU-only processing for this project.
Before real learner data, the owner must verify in writing for every selected
endpoint/model: project region, storage and processing locations, default abuse
monitoring retention, whether Zero Data Retention/Modified Abuse Monitoring is
approved and compatible, subprocessors, deletion behavior, and DPA terms.
Likewise verify Auth0 EU-tenant and Render Frankfurt data/backup/telemetry paths.
No real-data pilot proceeds if necessary transfers and retention cannot be
explained and accepted.

## Initial device support matrix

“Modern” means the latest and previous major stable browser/OS release at the
start of M06. Exact versions are recorded in that milestone. This matrix is a
conservative **target**, not physical validation.

| Device/browser target | Text | Voice target | M00 evidence/status | Required fallback |
| --- | --- | --- | --- | --- |
| iPhone Safari | Supported target | WebRTC microphone/playback, interruption | Not physically tested; iOS permission, route changes, lock/background behavior unresolved | Same-session text |
| iPad Safari | Supported target | WebRTC microphone/playback, interruption | Not physically tested; permission and route changes unresolved | Same-session text |
| Android Chrome | Supported target | WebRTC microphone/playback, interruption | Not physically tested; vendor audio routing/background behavior unresolved | Same-session text |
| Desktop Chrome (Windows/macOS) | Supported target | WebRTC microphone/playback, interruption | Standards/API fit only; not physically tested | Same-session text |
| Desktop Edge (Windows) | Supported target | WebRTC microphone/playback, interruption | Chromium/API fit only; not physically tested | Same-session text |

Firefox, desktop Safari, embedded webviews, older OS/browser releases and native
apps are best-effort/non-target for the first pilot. They are not declared broken,
but must receive a clear unsupported-voice message and text fallback rather than
an untested promise. `getUserMedia` requires a secure context; see
[MDN](https://developer.mozilla.org/docs/Web/API/MediaDevices/getUserMedia).
M06 must test real target devices for permission denied/revoked, headphones and
speaker routing, interruption, captions, reconnect/network switching, screen
lock/backgrounding, session expiry, accessibility, and fallback.

## M01 stack compatibility finding

The existing stack is **compatible; no blocker or architecture modification was
found before M02**:

| Component | Finding |
| --- | --- |
| Node 20.20.x / pnpm 10.28.1 | Pinned and suitable for NestJS build/runtime and workspace isolation; review Node support lifecycle before production. |
| TypeScript 5.9.2 | Strict shared configuration and boundary lint/tests preserve pure domain/application packages. |
| React 19 / Vite 7 | Suitable for an authenticated responsive SPA and browser WebRTC adapter; media access requires deployed HTTPS. |
| NestJS 11 | Suitable for OIDC callback/session endpoints, REST/SSE and provider sideband lifecycle outside domain code. |
| PostgreSQL 17.6 | Correct canonical state/transaction/outbox store; Prisma and first migrations remain M02 work. |
| Redis 8.2.1 | Appropriate for server sessions, delivery/cache and later BullMQ; never canonical learner state. Managed compatibility must be tested. |

This is a static/build compatibility conclusion, not proof of provider semantics
or target-device behavior. No SDK, product code, database schema, paid resource,
secret, or real learner datum was introduced. Synthetic/local checks are listed
in the milestone documentation.

## Resolved and unresolved gates

Resolved: provider and candidate text/realtime models; strict structured-output
approach; deterministic fake contract; browser WebRTC plus API sideband
architecture; server-mediated fallback decision rule; Auth0 EU identity shape;
Render Frankfurt topology; application retention targets; device support target;
stack compatibility; and initial cost controls.

Still unresolved by design: learner adulthood/authority and consent; actual
learner devices; live model quality/latency/cost; realtime credential expiry,
interruption, event authority and reconnect behavior; physical mobile behavior;
provider/DPA/regional-processing and independent retention terms; current paid
plan prices/features; and deployment/rollback/restore measurements. These require
owner facts, credentials, contracts, physical devices, or paid infrastructure.
They gate real-data use or M05/M06/M11—not M02's synthetic foundation work.
