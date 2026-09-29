# ADR 0003: Identity, hosting, and pilot budget

- **Status:** accepted for implementation; purchase requires owner approval
- **Date:** 2026-09-29
- **Decision owners:** product owner (contracts/spend) and technical owner
- **Scope:** M00 private-pilot operations only

## Context and decision

### Identity

Select an **Auth0 EU tenant** as the managed OIDC provider. Configure a Regular
Web Application using Authorization Code Flow, an exact callback/logout allowlist,
and the built-in database connection with public sign-up disabled. An operator
creates the one pilot identity and sends the provider's one-time invitation or
password-setup flow; the application has no registration route and stores no
password. Auth0 documents [OIDC protocol support](https://auth0.com/docs/authenticate/protocols/openid-connect-protocol),
[database-connection sign-up controls](https://auth0.com/docs/authenticate/database-connections/disable-sign-ups),
[tenant regions](https://auth0.com/docs/get-started/auth0-overview/create-tenants),
and [pricing](https://auth0.com/pricing).

After OIDC callback, the API maps immutable `(issuer, subject)` to an account and
uses an opaque, rotated, Secure + HttpOnly + SameSite cookie. Session state is
server-side in Redis with account ID, authentication time, absolute/idle expiry,
and CSRF state; never put provider tokens in browser storage. Regenerate on login,
validate issuer/audience/nonce/state/PKCE, protect mutations against CSRF, revoke
the local session immediately on account disable/delete, and keep refresh tokens
off unless a proven flow needs them.

Auth0 is selected because it is standards-based, offers an EU tenant location,
supports closed database sign-up, and its free tier is suitable for one monthly
active user. Migration risk is limited by the OIDC boundary and `(issuer,
subject)` mapping, but identities and setup tickets remain vendor-managed. Before
real access, verify the current plan includes every configured capability, sign
the required DPA, exercise disable/logout, and export the minimal identity mapping.

### Hosting

Select **Render's Frankfurt region** for the initial private pilot: static web,
one web service for the NestJS API, one continuously running background worker,
managed PostgreSQL, and managed Key Value (Redis-compatible) in the same region
and private network. Official documentation covers [regions](https://render.com/docs/regions),
[web services and WebSockets](https://render.com/docs/web-services),
[background workers](https://render.com/docs/background-workers),
[PostgreSQL](https://render.com/docs/postgresql-creating-connecting-databases),
[Key Value](https://render.com/docs/key-value), and
[rollbacks](https://render.com/docs/rollbacks).

Terminate HTTPS and route same-origin API traffic at the platform edge. Browser
WebRTC media goes directly to OpenAI, so Render does not relay media; the API's
long-lived sideband provider connection and browser application event stream do
require connection-duration testing, shutdown handling, and heartbeats. Deploy
immutable commit images, run migrations once as a release job, check readiness,
then promote. Keep a previous compatible image for rollback. Database restoration
is forward recovery; an image rollback cannot undo a destructive migration.

Render is selected over a VM because it supplies independent web/worker lifecycle,
EU managed data services, TLS/private networking, and practical image rollback
with little operations work. It is selected over scale-to-zero serverless for a
predictable worker and long-lived connections. Its trade-offs are single-vendor
regional concentration, fixed always-on costs, service-specific rollback and
possible egress. M11 must test deploy, drain, rollback and restore rather than
assuming the marketing contract is operational evidence.

## Cost envelope (USD, excluding tax and variable egress)

Prices change. These are planning assumptions based on public list prices and
must be re-quoted from the linked official pages before purchase.

| Category | Development assumption | One-user pilot assumption |
| --- | ---: | ---: |
| Local PostgreSQL/Redis/apps | $0 incremental | n/a |
| Render static web | n/a | $0/month assumption |
| Render API starter | optional | $7/month assumption |
| Render worker starter | optional | $7/month assumption |
| Managed PostgreSQL entry plan | optional | $6/month assumption |
| Managed Key Value entry plan | optional | $10/month assumption |
| Auth0 | $0 free-tier assumption | $0 for one MAU assumption |
| **Fixed infrastructure subtotal** | **$0 normally** | **$30/month estimate** |

Do not run paid shared development/staging continuously. An explicitly approved
deployment month can add another roughly **$30**; destroy it after the exercise
subject to required evidence/backup handling.

AI is variable and separate. For budgeting, assume twelve 10-minute pilot voice
sessions/month, roughly 15,000 uncached input-audio tokens and 7,500 output-audio
tokens per session, plus bounded text/report calls. At the planning rates of
`gpt-realtime-2.1-mini` ($10/M input-audio and $20/M output-audio tokens), voice is
about $0.30/session or $3.60/month; reserve **$6/month** including text analysis.
The refreshed model name does not change this planning calculation. This is an
estimate, not measured usage or a price guarantee; re-check official pricing
before any spend. Cached audio,
conversation growth, failed/repeated calls, transcription and taxes can change it.

Controls:

- normal local/CI AI spend: **$0** (deterministic fake only);
- each manually approved text evaluation: **$5 soft / $10 hard**;
- each manually approved voice/device spike: **$3 soft / $5 hard**;
- development AI total: **$10 soft / $20 hard per calendar month**;
- one-user pilot AI: **$6 soft / $10 application hard cap per month**;
- provider-project safety ceiling: **$20/month**, with alerts at 50% and 80%;
- pilot fixed infrastructure: **$30 expected / $40 approval ceiling per month**;
- total pilot: **$36 expected / $50 hard approval ceiling per month**.

The application hard cap must deny new paid sessions before estimated worst-case
usage crosses it; provider budget alerts are defense in depth, not transactional
enforcement. A session has a 15-minute duration cap, bounded output and at most
one analysis repair. Unknown usage is reserved conservatively. The owner must
approve **any paid service**, any evaluation run, a price above an assumption,
egress/add-on charges, or either ceiling increase. Stop rather than silently
exceeding a cap.

## Feasibility and review triggers

M01 already builds separate web/API/worker containers and connects PostgreSQL
and Redis, matching this topology. No service was provisioned. Network research
was attempted using the reproducible `curl` command recorded in ADR 0002, but
the environment proxy blocked all official pages; pricing and feature claims
therefore require owner re-verification before commitment.

Review if Frankfurt lacks a required service/plan, Redis commands required by
BullMQ are unsupported, WebSocket/sideband lifetimes fail M06 load tests, Auth0
cannot enforce invitation-only access on the chosen plan, the EU/provider terms
fail ADR 0004, or monthly cost breaches the approval ceiling.
