# ADR 0017 — M11 release machinery with blocked cloud promotion

- Status: proposed for technical review; cloud release blocked, M11 incomplete
- Verified: 2026-10-06; base main `c3413e4`
- Scope: M11 only; no resources provisioned, billing enabled or worker deployed
- Amends: ADR 0005 hosting feasibility; preserves ADR 0010/0011 provider defaults

The candidate remains Render Static Site Free + one Render Free API, Neon Free,
Upstash Redis/QStash Free and Auth0 Free. PostgreSQL owns history, outbox,
privacy fencing and release admission. There is no deployed worker. Monthly
operating target remains EUR 0 and `BILLING_MODE=free_only` is mandatory.
The currently usable topology is an isolated local web/API/PostgreSQL/Redis
stack with local Ollama + whisper.cpp and browser speechSynthesis.

**The candidate cloud topology is not approved for a learner.** Render loopback
addresses refer to the Render container, not the developer host. Its Free
512 MB/0.1 CPU instance and ephemeral filesystem do not establish usable
co-hosted `llama3.2:3b` plus multilingual Whisper/ffmpeg inference. Free services
cannot receive private-network traffic. We have not demonstrated a secure,
zero-cost host for those dependencies. Public tunnels, router forwarding,
developer-PC exposure, Gemini reactivation, remote AI fallback and paid instances
are rejected resolutions. Voice is locally implemented but genuinely deployable
cloud voice is **unproven and blocked**, as is default cloud text inference.

Current official Upstash docs additionally place Redis encryption at rest behind
paid Prod Pack. Redis currently contains session/account and OIDC transient
credentials. TLS alone does not satisfy SPEC's managed encryption-at-rest
requirement. Do not buy the add-on or quietly relax the requirement. QStash's
at-rest protection is also listed as an add-on; its minimal UUID/epoch envelopes
are still operational identifiers. Independent protected tombstone storage and
backup expiry have no verified operating destination. These are release gates,
not claims that a documentation lookup configured an account.

`release:preflight` checks repository policy/gates and explicitly reports blocked
promotion. `release:check` validates a strict environment manifest, full commit
SHA, OCI digest, schema compatibility, fresh review and production authorization.
It then refuses the current topology. Runtime bootstrap refuses both staging
and production before opening the API. Approval cannot bypass architecture
blockers; resolving one requires reviewed design/code/evidence, not an env flag.
No automated deployment workflow or deploy hook is installed.

M11 adds only an additive release-control table/admission trigger and a bounded
QStash budget. M10 image SQL remains compatible with the upgraded schema and
privacy fencing remains installed. Stop new sessions durably, finish existing
sessions, wait for live turn/analysis leases, migrate once under an operator lock,
then promote the same previously tested digest only after future gates permit
it. Never run migrations on API startup, run destructive down migrations, or
roll back to an image predating M10. Older unsafe privacy code is not a rollback
option. An actual previous-image container rollback remains an explicit manual
exit gate until candidate hosting and artifacts exist.

See [provider verification](../m11-provider-verification.md),
[release runbook](../m11-release-runbook.md), [secret inventory](../m11-secret-inventory.md),
[pilot checklist](../m11-pilot-checklist.md), and [validation](../m11-validation.md).
