# ADR 0006: M02 identity boundary and server sessions

- **Status:** accepted for synthetic M02; production Auth0 adapter blocked pending verification
- **Date:** 2026-09-29

## Context and decision

The application owns an identity port expressed only as immutable OIDC issuer and subject. A deterministic synthetic adapter is enabled outside production and creates no passwords. Production authentication remains blocked: on 2026-09-29 official Auth0 research was attempted through the available web research service, which returned HTTP 401 before results. Historic official links describe OIDC, database sign-up controls, callback/logout allowlists, tenant regions and pricing, but that is not current evidence that a private one-user invitation, Authorization Code + PKCE, callback/logout configuration and every dependency remain Auth0 Free without a trial. Therefore M02 does **not** ship or configure an Auth0 SDK, tenant, paid feature, fallback or secret.

Before production, re-check the official [pricing](https://auth0.com/pricing), [OIDC](https://auth0.com/docs/authenticate/protocols/openid-connect-protocol), [Authorization Code with PKCE](https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow-with-pkce), [disable sign-ups](https://auth0.com/docs/authenticate/database-connections/disable-sign-ups), and application settings documentation. Prove an operator-created/invited user works with public signup closed, exact callback/logout URLs and no trial/billing. If not, evaluate a zero-cost standards-based OIDC provider behind the same port; do not weaken session controls.

After authentication, FluentCoach rotates to a random 256-bit opaque ID. Redis stores only account ID, authentication time, CSRF token, last activity and absolute expiry. Cookies are HttpOnly, SameSite=Lax and Secure in production. Sessions expire after 30 minutes idle or 12 hours absolute, logout deletes state, and each request rejects disabled/deleting accounts. Mutations require a matching custom CSRF header and permitted Origin. OIDC tokens are never browser-stored. Redis is non-canonical; loss signs users out.

## Consequences

CI is deterministic and network-free. Production login is intentionally unavailable until the dated free-capability gate passes. The synthetic endpoint hard-fails in production. A future Auth0 adapter must validate state, nonce, issuer, audience and PKCE and must not leak provider types into application/domain code.
