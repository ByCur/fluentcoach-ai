# M10 security and logging gates

Pinned scanners: Gitleaks 8.24.3 and Trivy 0.75.0. Install with
`sh scripts/install-security-scanners.sh /tmp/m10-scanners`; release tarballs are
checked against release SHA256 checksum files. `pnpm test:security` refuses wrong
scanner versions, scans git history with redacted findings, audits production
pnpm dependencies and scans built API/web/worker images with current vulnerability
DB. Images must exist as `fluentcoach-{api,web,worker}:security` and use non-root
runtime users. Missing scanners/audit/network/images fail the gate.

Production dependency HIGH/CRITICAL findings block CI, without advisory ignores.
The initial audit found 11 HIGH records; patched multer 2.3.0, Vite 7.3.5,
path-to-regexp 8.4.0, source-map-js 1.2.2 and Express 5.2.1 remove them. Exact pnpm
overrides cover nested copies. Moderate/low findings are reported, not described
as zero vulnerabilities. Dependency and image databases change over time.

Trivy blocks HIGH/CRITICAL runtime findings with available fixes
(`--ignore-unfixed`); this is explicitly a fixable-vulnerability gate, not a claim
that unpatched vulnerabilities do not exist. No CVE exceptions are configured.
Containers upgrade Alpine runtime packages during build and are scanned after
build. API/worker deploy only production dependencies; Prisma/schema tooling
lives in a separate migration target. Runtime npm/corepack are removed. Web runs
as nginx with writable temporary paths, and API/worker as node. Shell/wget remain
for local health checks. Environment files and proxy CA never enter image layers.

API/browser headers include nosniff, no-referrer, frame restrictions and
microphone self-only policy. Browser CSP permits bundled scripts/self-origin
connections and transient blob media; inline style is needed for progress widths.
API CSP defaults to none. HSTS applies only to configured production HTTPS API.
The reverse proxy forwards the actual Origin; it does not manufacture a trusted
Origin. Headers do not replace CSRF, ownership, input validation or output safety.

Logging uses a closed operation/outcome vocabulary and bounded finite numeric
status/count/duration values. All keys are copied from this allowlist; arbitrary
objects, headers, exception messages, request bodies, paths, content and account
IDs never reach telemetry. Nest default raw error logging and nginx access logs
are disabled. Redis emits no uncontrolled error events. HTTP error messages use
fixed application-owned codes and Spanish validation copy, not SQL/provider
bodies. Synthetic tests inject secrets/content through real HTTP, database,
Redis/provider/plan/audio failure paths and assert outputs/logs never contain them.
No paid telemetry backend or external resource is provisioned.

## Explicit operational caps

Registry: `operational-limits-v1` and versioned privacy policy constants.

| Resource | Server/database cap |
| --- | --- |
| Text learner turn | 2,000 characters |
| Tutor accumulated output / voice transcript | 8,000 characters |
| Ollama provider JSON prose | 128,000 characters; adapter transport bounds remain |
| Audio | 8 MiB, 30 seconds, webm/ogg/wav/x-wav/mp4/mpeg MIME allowlist |
| JSON body / URL | 64 KiB / 2,048 characters |
| Review page | default 20, maximum 50 |
| Plan activities | 2–5 selected server catalog activities |
| Export | default 8 MiB; configured 1 KiB–64 MiB; 24-hour expiry |
| Export requests | 1 pending, 3 per rolling server day, UUID idempotency key |
| Open sessions | 5 CREATED/ACTIVE per account, enforced inside PostgreSQL |
| Background retries | maximum 3 analysis/privacy attempts |
| Retention batch | 25 source sessions per account transaction |

Ended/abandoned/failed sessions release open-session capacity. Rate/canonical
limits do not depend on Redis, so a Redis outage cannot disable these bounds.
The scanner reports 0 fixable HIGH/CRITICAL in each patched API/web/worker image;
production dependencies report 0 HIGH/CRITICAL, 4 MODERATE, 1 LOW. Gitleaks history
scan reports no findings. See final validation for the checked head and run.
