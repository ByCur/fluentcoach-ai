# M11 secret inventory and environment boundaries

No values belong in git, images, frontend bundles, reports or logs. Each deployed
environment would need its own least-privilege secret store and credentials.
Templates under `infra/environments/` are **non-secret config**, not provisioning
or an approved release. They contain no database, Redis or OIDC credentials.
Do not copy local/test secrets into staging/production or reuse production
identities for tests. Test API startup accepts only local hosts and `_test` DBs. CI browser fixtures
use a dedicated `fluentcoach_browser_test` database. Earlier database integration
gates continue to use their existing disposable CI database; no real data is used.

| Value | Exposure / owner / rotation |
| --- | --- |
| `DATABASE_URL` | Server/operator only, contains login. Use separate database/role per environment and separate privileged direct migration role. Rotate at provider and inject replacement; revoke old role after verification. Never expose connection strings in errors. |
| `REDIS_URL` | Server only, contains Redis credential. Separate secure resource per environment, `rediss://` on cloud. Rotate via provider; invalidate all sessions/OIDC state and require fresh login. Free at-rest blocker remains. |
| `OIDC_CLIENT_SECRET` | Server only, distinct Auth0 app/tenant per environment. Rotate Auth0 app secret, update injected value and revoke previous secret; verify PKCE/state/nonce/callback. |
| `QSTASH_TOKEN` | Server publishing only; not browser execution authority. Rotate at provider; preserve PostgreSQL outbox during outage. |
| `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY` | Server verification only. Support provider key transition, then retire old signing material. Never put keys in job bodies. |
| `fc_session`, CSRF tokens, OIDC state/nonce/verifier/tokens | Short-lived credentials; secure HttpOnly session cookie, server-side Redis/OIDC lifecycle. Browser receives only its scoped CSRF value. Never log headers, callback query, signed QStash JWT or Redis values. Revocation still checks canonical account status. |
| Optional `GEMINI_API_KEY` | Existing adapter server-only; M11 does not select/enable it. No key is needed for Ollama/whisper.cpp. |
| Registry pull token / deploy hook / provider management token | Operator/approved CI secret store only; current implementation stores/uses none. A deploy hook is a secret URL, not a public health endpoint. Never commit hooks or enable an ungated auto-deploy. |
| Backup encryption key / independent ledger encryption key | Operator only, distinct from live DB credentials and from the backup itself. Offline protected recovery copy, rotation/recovery procedure required. Current storage/key custody is unverified; release remains blocked. |
| `PUBLIC_ORIGIN`, `PUBLIC_API_ORIGIN`, OIDC issuer/client ID/audience/callback/logout, release SHA/digest/schema | Non-secret server config/identity; exact HTTPS origins/allowlists for cloud. Browser auth mode comes from API; no runtime secret/config object is serialized. |

Browser build exposes only Vite built-ins; the reserved `VITE_PUBLIC_` prefix is
not used for product configuration. Do not put secrets behind any Vite prefix.
`test:deployment` builds actual assets with canaries in all seven server secret
variables, their `VITE_`/`VITE_PUBLIC_` variants, and a `VITE_GEMINI_API_KEY` trap, scans output and browser source, and
checks the detector rejects an intentionally leaked value. This complements the
existing Gitleaks/history, dependency and image gates; it is not a claim to detect
all possible obfuscated secrets. A leaked value requires revocation/rotation,
not merely deletion of the file.

Bootstrap loads `.env` only in local mode and `.env.test` only in test mode.
Browser gates refuse to reuse an already listening development API/web server.
Staging/production use `NODE_ENV=production` and receive injected configuration;
synthetic login/fake providers are forbidden. Current cloud bootstrap fails
before listening because no approved zero-cost local-provider topology exists.
