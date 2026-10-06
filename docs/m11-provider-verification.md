# M11 official provider verification — 2026-10-06

These official pages were contacted during M11 work. This verifies public
published claims, not tenant entitlement, region placement, data-processing
agreements, backup safety or deployment readiness. Recheck immediately before
release; manifests expire the review after seven days. No accounts/resources were
created and no payment method was supplied. Trial credits do not qualify.

| Service | Current official evidence and limits | Free-only decision / remaining gate |
| --- | --- | --- |
| Render | [Free services](https://render.com/docs/free), [compute plans](https://render.com/docs/compute-plans): free static hosting, 750 API instance-hours/workspace/month, idle spin-down after 15 minutes, startup roughly a minute, ephemeral disk, 512 MB/0.1 CPU; Free has no persistent disk, shell, one-off jobs or inbound private-network traffic. | Candidate only. Leave payment method absent: bandwidth exhaustion suspends service and build quota exhaustion stops builds rather than billing. Outbound-heavy API suspension is possible. No worker and no keepalive workaround. Actual workspace quotas and selected EU region unverified. Local AI/voice hosting blocked. |
| Neon | [Plans](https://neon.com/docs/introduction/plans): Free $0, 100 CU-hours/project/month, **1 GB/project** (20 GB total), 100 projects, 10 branches/project, 5 GB/project public transfer; five-minute scale-to-zero; six-hour restore history capped at 1 GB of changes, one manual snapshot, one-day monitoring. Compute/transfer exhaustion suspends; storage-growing operations fail at storage cap, including deletes. | Published Free allowances verified; older ADR 0005 0.5 GiB snapshot is stale. Free is a distinct plan, not Launch/Scale with credits. Actual project, TLS/direct migration endpoint, quotas, chosen region and independent backups unverified. Reserve storage headroom for privacy/deletion. Never upgrade to recover. |
| Upstash Redis | [Pricing](https://upstash.com/pricing/redis), [security](https://upstash.com/docs/redis/features/security): one Free DB, 256 MB, 500K monthly commands, 10 GB bandwidth. Adding a credit card upgrades a Free database to pay-as-you-go. TLS always enabled; encryption at rest requires paid Prod Pack; ACL is paid. | Free price verified, **security blocker** for current credential-bearing session design. No card/auto-upgrade/Prod Pack. A shared database or Redis logical DB index is not staging/production security isolation; separate entitled accounts/resources would need proof. Free archival/inactivity handling must be verified against the actual tenant. |
| Upstash QStash | [Pricing](https://upstash.com/pricing/qstash), [machine-readable pricing](https://upstash.com/pricing/qstash.md), [retry](https://upstash.com/docs/qstash/features/retry), [security](https://upstash.com/docs/qstash/features/security): Free $0, 1,000 messages/day, 50 GB bandwidth, 1 MB message, seven-day delay, 15-minute response duration, three-day logs/DLQ, ten schedules. Signed at-least-once delivery; signatures bind destination and exact body. | Conditional. Pricing's retry accounting conflicts with its own introductory description; soft-limit wording cannot prove tenant-specific hard exhaustion/no-overage. Reserve at most 100 publications/UTC day in PostgreSQL, allow three delivery retries, stop the day on 429, preserve outbox pending. Encryption at rest/region/retention/no-card tenant behavior remain manual gates. |
| Auth0 | [Pricing](https://auth0.com/pricing): Free $0, no credit card needed to sign up, up to 25K MAU. Advertised custom domain needs card verification; do not use it. [PKCE](https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow-with-pkce) and [connection signup restriction](https://support.auth0.com/center/s/article/Disable-Signups-at-Connection-Level) document the required flow/control. | Conditional Free tenant after any trial expires. Separate stage/prod tenants/applications; no custom domain. Operator must disable public/social signup, manually invite exactly one learner, validate callback/logout allowlists, session expiry, recent authentication for deletion and reject an uninvited identity. No actual tenant was contacted. |

Data/privacy operating review is still open. Official service privacy/processing
sources: [Render security](https://render.com/docs/security),
[Neon security](https://neon.com/docs/security/security-overview),
[Upstash privacy](https://upstash.com/trust/privacy.pdf),
[Auth0 privacy](https://www.okta.com/privacy-policy/).
Before real data, the operator must capture the selected region, subprocessors,
provider data retention/deletion and contractual terms for the **actual Free
account**, including logs/backups and OIDC identifiers. We do not claim EU-only
processing or external-provider deletion from product database deletion.

Ollama and whisper.cpp remain local defaults. No Gemini terms/model check can
make Gemini a replacement under M11. Browser speechSynthesis can use a system
network voice; show captions and disclose that offline playback is not assured.
The existing local-first consent remains appropriate only for the verified local
pipeline; any future hosting/data boundary needs a reviewed versioned disclosure.
