# ADR 0006: M02 Auth0 Free identity boundary and server sessions

- **Status:** accepted for implementation; tenant provisioning and live callback verification remain M11 gates
- **Date:** 2026-09-29

## Context and Auth0 Free verification

The one-user zero-cost pilot uses an Auth0 Free tenant without Organizations or a paid invitation feature. An operator manually creates the single database-connection user and disables public signups. The application is a Regular Web Application using OIDC Authorization Code Flow with PKCE and exact callback/logout allowlists. This design relies only on the Free tenant, database connection, user management, and standards-based OIDC surface; it does not require a custom domain, Organizations, trial, payment method, or paid add-on.

The relevant official references are Auth0 [pricing](https://auth0.com/pricing), [OIDC protocol support](https://auth0.com/docs/authenticate/protocols/openid-connect-protocol), [Authorization Code Flow with PKCE](https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow-with-pkce), [database sign-up controls](https://auth0.com/docs/authenticate/database-connections/disable-sign-ups), [user creation](https://auth0.com/docs/manage-users/user-accounts/create-users), and [application callback/logout settings](https://auth0.com/docs/get-started/applications/application-settings). The implementation environment could not re-fetch those pages because its outbound proxy returned HTTP 403 and its research tool returned HTTP 401; therefore tenant configuration and an end-to-end live callback are still explicit pre-provisioning gates. A plan change that makes any required capability billable blocks deployment rather than enabling billing.

## Decision

The application-owned `OidcProvider` port exposes only an authorization redirect and the resulting immutable issuer/subject. The Auth0 infrastructure adapter creates one-time state, nonce, and PKCE verifier values in Redis, uses S256, consumes state once, performs token exchange server-side, validates the ID token signature using the issuer JWKS, and validates ID-token issuer/client audience, access-token API audience, nonce, and subject. Exact issuer, client ID, server-held client secret, API audience, callback URL, and logout URL are mandatory production configuration. Provider tokens never reach browser storage or application/domain code.

After the callback, FluentCoach maps `(issuer, subject)` to an account and rotates to a random 256-bit opaque ID. Redis stores only account ID, authentication time, CSRF token, last activity, and absolute expiry. Cookies are HttpOnly, SameSite=Lax, and Secure in production. Sessions expire after 30 minutes idle or 12 hours absolute; logout deletes state; every request rejects disabled/deleting accounts. Mutations require the session CSRF value and exact allowed Origin. An authenticated CSRF bootstrap endpoint returns only the CSRF value, never the opaque session ID.

Synthetic identity and a deterministic fake OIDC adapter are enabled only outside production. Production startup requires complete OIDC configuration, and the synthetic login endpoint hard-fails in production. CI requires no Auth0 network access or secret.

## Consequences and review triggers

A real tenant is not provisioned by M02. Before pilot deployment, re-check current Free entitlements, configure EU tenant/connection/user and exact URLs, verify public signup is closed, exercise PKCE/callback/logout/disable behavior, and confirm applicable privacy/DPA terms. If any required capability becomes paid, stop and evaluate another zero-cost OIDC adapter behind the same port; never silently weaken security or add billing.
