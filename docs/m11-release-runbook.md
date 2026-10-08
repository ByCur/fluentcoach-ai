# M11 release, rollback and recovery operating procedure

**Current state: cloud deployment blocked.** No deploy command, resource blueprint
or production auto-deploy exists. Do not create resources to bypass the gate.
`pnpm release:preflight` passing means repository checks passed and prints blocked
status; it is not authorization or provider readiness. `pnpm release:check` always
rejects the current candidate after validation. The production runtime rejects it
as well. No image digest or remote smoke success has been invented.

## Identity and controlled migration

CI preserves every prior gate and adds migrations, repository preflight,
deployment, release/recovery and cold-start browser gates. It builds a separate
OCI API archive with the exact GitHub SHA and records Buildx's
`containerimage.digest`, verifies archived OCI blob checksums and baked SHA/schema,
with current migration `202610070001_tutor_opening_progress` and compatible previous
schema `202610060003_roadmap`.
The immutable identity artifact is uploaded with the archive for one day; a future
operator must retain approved/current/previous digests in verified protected
zero-cost storage before release. CI retention alone is not release custody. An image tag or
Docker config `.Id` is not an OCI manifest digest. Promote the exact tested
archive/digest; do not rebuild between stage and production. Record frontend
artifact SHA256 alongside the API identity before future promotion; current
static hosting and routing remain unverified. OCI SHA label and migration are
baked into the API; an operator injects the matching manifest digest. `/health/release`
returns 503 until all identity fields are present and valid. Health cannot prove
that a claimed digest was pulled: operator/CI must compare it to the registry and
actual running artifact.

Commands currently operate **only on explicitly selected disposable local
`_test` databases**, and refuse cloud environment selection. Start local Postgres/
Redis, set `NODE_ENV=test`, `DATABASE_URL` ending `_test`, `REDIS_URL`, and run:

```sh
pnpm release:preflight
pnpm release:migrate -- --environment test --confirm-sha "$(git rev-parse HEAD)"
pnpm release:drain -- --environment test --confirm-sha "$(git rev-parse HEAD)"
pnpm release:status -- --environment test --confirm-sha "$(git rev-parse HEAD)"
pnpm release:resume -- --environment test --confirm-sha "$(git rev-parse HEAD)"
```

Migrate uses one session advisory lock and Prisma checksums/completion history;
it is never run at API startup. Separate migration credentials from API access.
The low-level `db:migrate:deploy` is an operator utility, not deployment approval;
never wire it into automatic cloud startup. Use direct Neon migration connectivity
rather than transaction-pooled sessions when a topology is eventually approved.
A failed migration holds promotion, with logs inspected privately. Do not print
SQL/credentials/learner content to CI output. Confirm the full migration chain and
schema readiness after success. Repeating migration is harmless; concurrent
release operations refuse the lock.

## Draining and compatible rollback

1. Set durable `release_control.draining=true` under the release-operation lock.
   The PostgreSQL trigger rejects every new `practice_sessions` insert, including
   plan-start inserts, with fixed `RELEASE_DRAINING`. Admission uses a shared row
   lock; a drain update waits for starts already admitted to commit. No Redis
   flag or browser state can override it. Existing turns, reads, session ends,
   reports, deletion and retention remain available.
2. Wait for `active_sessions=0`, `turn_leases=0`, `analysis_leases=0`. These are
   content-free counts; no destructive force-drain exists. Invitee ends the
   session normally. Abandoned sessions need reviewed manual handling; lease
   expiry alone does not authorize traffic switching or discard a learner turn.
3. Apply additive migrations once, validate old/current SQL compatibility and
   deletion fencing, then test the same artifact on isolated staging. The new
   image requires M11 migration in readiness. Do not drop columns, gates or the
   tombstone ledger. Migration SQL preserves every existing M10 column/type.
4. If promotion fails, keep admission closed, select the **previous tested M10-or-
   later immutable digest** on the forward schema, inject its original identity,
   verify health and synthetic two-account learner/Privacy paths, then explicitly
   resume admission. Pending outbox and persisted cursors must survive. No down
   migration and no pre-M10 image: privacy fencing cannot be undone.
5. If schema/image compatibility cannot be established, hold traffic, restore
   into isolation and replay the independent ledger below. Obtain a separate
   explicit authorization before switching traffic.

SQL/transaction tests exercise previous-schema upgrade and M10-compatible reads,
turn completion and drain. They do **not** claim an actual prior container digest
rollback or hosted traffic switch. Those remain manual release evidence.
Render [image deployment](https://render.com/docs/deploying-an-image) supports
specific digest references; [deploy hooks](https://render.com/docs/deploy-hooks)
support a digest parameter. A future authorized operator must pin that digest,
disable auto-deploy and use protected production environment review before any
hook call. This PR does not install a hook or contact a hosting control plane.

## Failure behavior and monitoring

- Cold start: browser polls actual JSON readiness with bounded attempts, announces
  startup, and does not authenticate or create sessions on Render HTML responses.
  SSE reconnects at most five times using durable cursor; duplicate events are
  ignored. Mutations are never silently replayed; text retry uses the original
  request key after a lost acknowledgement. Reopen Practice to reconnect after
  exhaustion. Voice acknowledgement recovery remains manual; do not resend audio
  blindly with a new key. Existing session data remains canonical.
- QStash delay/duplicates: work stays in PostgreSQL; signatures bind API origin,
  exact path/body/current-or-next key. At-least-once leases/effects remain fenced.
  Delayed publication becomes eligible for reconciliation after 30 seconds.
  PostgreSQL caps publication at 100/UTC day; errors consume a reservation, 429
  blocks the day, and restarts do not reset budget. No paid transport/worker
  fallback. All app publishers must use this budget; avoid external schedules
  consuming unrecorded capacity. Inspect oldest pending age/DLQ before three-day
  provider log expiry; reconcilers run only while the API is awake. Free tiers
  provide no background freshness SLA.
- Redis loss/outage: fail authentication or require fresh login with new CSRF;
  never reconstruct privileges from browser input. PostgreSQL history, deletion
  epochs, outbox and budgets survive. Repair Redis, rotate compromised credential,
  then reauthenticate; do not roll back learner state to repair a cache.
- Quota/exhaustion: stop growing work before the canonical database is full,
  monitor free service dashboards and their free email alerts; use sanitized
  counts/oldest pending age/readiness and latency only. Storage headroom must
  permit deletion. Provider email alert availability/recipients and an operator
  response interval are manual gates. No paid alerting, uptime robot or keepalive
  service is installed. Lost alerting is not permission to call/upgrade.

## Backup and independent tombstone ledger

Follow [M10 restore procedure](m10-restore-runbook.md). Before real data:

1. Assign operator/key custody and two independently protected destinations for
   encrypted PostgreSQL custom dumps and the current content-free identifying
   tombstone ledger. Neither belongs on Render's ephemeral filesystem, in git,
   public CI artifacts or the historical dump alone. Verify zero-cost capacity,
   access restrictions, encryption, deletion and expiry; no destination has been
   selected/provisioned in this PR.
2. Proposed operating targets, **not measured SLAs**: daily dump (RPO <=24 h),
   ledger export after every deletion commit plus daily reconciliation (ledger
   lag gates restore), weekly isolated restore rehearsal; RTO must be measured.
   Pause traffic/deletions to capture a final ledger immediately before recovery.
   Missing or stale independent ledger blocks recovery traffic.
3. Run `pg_dump --format=custom` with operator credentials privately, encrypt the
   result before transfer, record timestamp/checksum/schema version and restore
   test. Export ledger with `pnpm privacy:tombstones:export /secure/ledger.json`;
   export uses mode 0600/exclusive creation. Protect separately; verify latest
   requested as well as completed deletions exist in the ledger. Failed export
   pauses real-data admission pending operator repair; do not claim it succeeded.
4. Enforce dump expiry within 30 days, including copies/version histories. Track
   successful purge separately. Preserve tombstones as long as any corresponding
   restorable backup remains, including requested unfinished deletion; review
   ledger minimization only after those backups are irrecoverable. External
   service retention must be separately verified, not inferred from local purge.
5. Restore dump into an isolated no-traffic database, forward-migrate, set
   `PRIVACY_RESTORE_ISOLATED=1`, replay latest independent ledger twice and verify
   deleted accounts and derived rows absent, surviving history intact, schema
   ready and pending work fenced. Any failure leaves traffic isolated. No direct
   restore over a live database, traffic switch or expired-privacy rollback.
6. Run `pnpm drill:restore` against a dedicated `_test` database with
   `PRIVACY_DRILL_DISPOSABLE=1`. Its actual pg_dump/pg_restore synthetic rehearsal
   is required CI evidence; it does not validate real storage encryption, expiry,
   ledger independence or production RPO/RTO.

## Explicit environment smoke and production authorization

Commands never default to localhost and perform only bounded read-only requests.
They check frontend HTML, API live/ready, exact immutable identity, unauthenticated
401 and OIDC mode. They make no provider call, synthetic login or learner writes.
Use actual HTTPS origins, not these schematic variables:

```sh
pnpm test:smoke:staging -- --base-url "$STAGING_WEB_ORIGIN" --api-base-url "$STAGING_API_ORIGIN" --manifest /secure/staging-release.json
pnpm test:smoke:production -- --base-url "$PRODUCTION_WEB_ORIGIN" --api-base-url "$PRODUCTION_API_ORIGIN" --manifest /secure/production-release.json --authorization /secure/operator-authorization.json
pnpm release:check -- --manifest /secure/production-release.json --authorization /secure/operator-authorization.json
```

Manifest fields are strictly defined in `release-policy.ts`: release-v1,
environment, identity (full 40-character SHA, `sha256:` OCI digest, current and
compatible migrations), selected topology, free-only/EUR0, false billing/card/
upgrade/fallback/worker booleans, all five Free service plans, review date and
isolation evidence ID. No permissive unknown fields. Authorization is a separate
operator record with `action=production-deployment`, production environment,
operator, exact identity and unexpired ISO timestamp. A config boolean, a green
PR, this user's request to create a PR, or a staging pass is **not** production
authorization. No deployment is possible while the architectural blockers remain.
Real smoke evidence must record contacted origins, UTC time, SHA/digest, response
outcomes and synthetic-probe limits. Do not mark environment passes from mocks.
A future full synthetic learner path probe needs separate approved fixture/consent,
request budget and privacy cleanup; this read-only smoke is not that path.
