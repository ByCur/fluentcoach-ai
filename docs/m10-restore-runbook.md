# Isolated restore and deletion replay

Never restore onto the developer's normal database. Never switch traffic as part
of this procedure. The database backup and later tombstone ledger are separate
inputs; missing ledger is a failed privacy gate.

1. Export the current ledger before changing the canonical database:
   `pnpm privacy:tombstones:export -- /secure/path/ledger.json`.
   New files use mode 0600 and exclusive creation. Protect and back up this
   content-free, identifying operational ledger separately from database backups.
2. Restore the old pg_dump into a new isolated `_restore` database with no traffic.
3. Apply current committed migrations using `pnpm db:migrate:deploy` against it.
4. Set `PRIVACY_RESTORE_ISOLATED=1` and its DATABASE_URL, then run
   `pnpm privacy:tombstones:replay -- /secure/path/ledger.json`.
5. Replay all supplied tombstones, including requested unfinished deletions.
   The tool purges matching account/product rows, validates schema readiness and
   verifies all supplied account UUIDs are absent. Interrupted replay can rerun.
6. Verify surviving account history and unavailable/derived evidence behavior;
   review pending jobs and service dependency readiness. Only after all checks
   may a human consider a separately authorized traffic change.

## Reproducible synthetic local/CI drill

Start compose PostgreSQL/Redis. Provide a disposable localhost database URL whose
name ends `_test`, and `PRIVACY_DRILL_DISPOSABLE=1`:

```sh
DATABASE_URL=postgresql://fluentcoach:local-development-only@localhost:5432/fluentcoach_restore_test \
PRIVACY_DRILL_DISPOSABLE=1 pnpm drill:restore
```

The supplied database is only an authorization/connection selector: the script
creates two uniquely named `fluentcoach_drill_source_*`/`*_restore_*` databases,
applies the entire migration chain, seeds synthetic A/B with M07/M08/M09 history,
runs actual PostgreSQL 17 `pg_dump --format=custom`, deletes A and exports its
ledger outside the backup, then runs actual `pg_restore --exit-on-error` into the
second DB. It applies missing current migrations, replays twice and checks A and
all its representative derived state are absent; B's sessions/reports/issues,
vocabulary/reviews, plans/activities and progress survive, and schemaReady passes.
It drops only those generated databases and removes temporary dump/ledger files.
It refuses a production-like URL, missing flag or non-local host.

Measured synthetic run: 18,824.76 ms, 125,048 backup bytes, two replay passes,
A absent/B history intact/readiness true. It passed. Re-run measurements are
recorded in validation results. This is not a production RPO/RTO, backup SLA,
backup expiry guarantee, encryption/tenant recovery test or production failover.
