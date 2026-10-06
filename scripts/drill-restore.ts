import { execFileSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { readdir, readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import pg from "pg";
// The parent creates two unique disposable databases. Child owns all runtime pools.
async function apply(url: string) {
  const db = new pg.Pool({ connectionString: url });
  try {
    await db.query(
      "CREATE TABLE IF NOT EXISTS _prisma_migrations(id VARCHAR(36) PRIMARY KEY,checksum VARCHAR(64) NOT NULL,finished_at TIMESTAMPTZ,migration_name VARCHAR(255) NOT NULL,logs TEXT,rolled_back_at TIMESTAMPTZ,started_at TIMESTAMPTZ NOT NULL DEFAULT now(),applied_steps_count INTEGER NOT NULL DEFAULT 0)",
    );
    const root = "packages/infrastructure/prisma/migrations";
    for (const name of (await readdir(root, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort()) {
      if (
        (
          await db.query(
            "SELECT 1 FROM _prisma_migrations WHERE migration_name=$1 AND finished_at IS NOT NULL AND rolled_back_at IS NULL",
            [name],
          )
        ).rowCount
      )
        continue;
      const source = await readFile(`${root}/${name}/migration.sql`, "utf8"),
        c = await db.connect();
      try {
        await c.query("BEGIN");
        await c.query(source);
        await c.query(
          "INSERT INTO _prisma_migrations(id,checksum,finished_at,migration_name,applied_steps_count) VALUES($1,$2,now(),$3,1)",
          [
            randomUUID(),
            createHash("sha256").update(source).digest("hex"),
            name,
          ],
        );
        await c.query("COMMIT");
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      } finally {
        c.release();
      }
    }
  } finally {
    await db.end();
  }
}
async function child() {
  const {
    PostgresPrivacyRepository,
    PostgresPlanRepository,
    PostgresVocabularyRepository,
    sql,
    schemaReady,
    pool,
  } = await import("@fluentcoach/infrastructure");
  const { account } = await import("../tests/support/database.js");
  const { reportPractice, dueCard } = await import("../tests/support/m09.js");
  const [phase, file] = process.argv.slice(3),
    privacy = new PostgresPrivacyRepository();
  try {
    if (phase === "seed") {
      for (const label of ["drill-A", "drill-B"]) {
        const a = await account(label);
        await sql("INSERT INTO practice_goals(account_id) VALUES($1)", [a.id]);
        await reportPractice(a.id, 2);
        const card = await dueCard(a.id);
        await new PostgresVocabularyRepository().review(a.id, card.id, {
          reviewKey: randomUUID(),
          expectedVersion: 1,
          rating: "good",
        });
        await new PostgresPlanRepository().generate(a.id, {
          requestKey: randomUUID(),
        });
      }
    } else if (phase === "delete") {
      const a = (
        await sql<{ id: string }>(
          "SELECT id FROM accounts WHERE oidc_subject='drill-A'",
        )
      )[0]!;
      const j = await privacy.requestDeletion(a.id, randomUUID());
      await privacy.execute(j.id);
      await writeFile(file!, JSON.stringify(await privacy.exportTombstones()), {
        mode: 0o600,
      });
    } else if (phase === "replay") {
      const ledger = JSON.parse(
        await readFile(file!, "utf8"),
      ) as import("@fluentcoach/domain").Tombstone[];
      await privacy.replay(ledger);
      await privacy.replay(ledger);
      if (!(await schemaReady())) throw Error("RESTORE_NOT_READY");
      if (
        (await sql("SELECT 1 FROM accounts WHERE oidc_subject='drill-A'"))
          .length
      )
        throw Error("RESTORED_DELETED_ACCOUNT");
      const b = (
        await sql<{ id: string }>(
          "SELECT id FROM accounts WHERE oidc_subject='drill-B'",
        )
      )[0];
      if (!b) throw Error("SURVIVING_ACCOUNT_MISSING");
      for (const table of [
        "practice_sessions",
        "session_reports",
        "issue_observations",
        "vocabulary_cards",
        "vocabulary_review_events",
        "learning_plans",
        "learning_plan_activities",
        "practice_events",
      ]) {
        if (
          !(await sql(`SELECT 1 FROM ${table} WHERE account_id=$1`, [b.id]))
            .length
        )
          throw Error("SURVIVING_HISTORY_MISSING");
        if (
          (
            await sql(`SELECT 1 FROM ${table} WHERE account_id=$1`, [
              ledger[0]!.accountId,
            ])
          ).length
        )
          throw Error("DELETED_HISTORY_RESTORED");
      }
    } else throw Error("INVALID_DRILL_PHASE");
  } finally {
    await pool.end();
  }
}
async function main() {
  if (process.argv[2] === "--child") {
    await child();
    return;
  }
  const url = new URL(process.env["DATABASE_URL"] ?? "");
  if (
    process.env["PRIVACY_DRILL_DISPOSABLE"] !== "1" ||
    !/_test$/.test(url.pathname) ||
    !["localhost", "127.0.0.1"].includes(url.hostname)
  )
    throw Error(
      "Drill requires PRIVACY_DRILL_DISPOSABLE=1, localhost and a _test database",
    );
  const started = performance.now(),
    suffix = randomUUID().replaceAll("-", ""),
    source = `fluentcoach_drill_source_${suffix}`,
    restored = `fluentcoach_drill_restore_${suffix}`,
    dir = await mkdtemp(tmpdir() + "/m10-restore-");
  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const admin = new pg.Pool({ connectionString: adminUrl.toString() });
  const docker = (args: string[], input?: Buffer) =>
    execFileSync("docker", ["compose", "exec", "-T", "postgres", ...args], {
      input,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    });
  const run = (name: string, phase: string) => {
    const childUrl = new URL(url);
    childUrl.pathname = "/" + name;
    execFileSync(
      "pnpm",
      [
        "exec",
        "tsx",
        "scripts/drill-restore.ts",
        "--child",
        phase,
        dir + "/ledger.json",
      ],
      {
        env: {
          ...process.env,
          DATABASE_URL: childUrl.toString(),
          AI_PROVIDER: "fake",
        },
        stdio: "pipe",
      },
    );
  };
  try {
    await admin.query(`CREATE DATABASE "${source}"`);
    await admin.query(`CREATE DATABASE "${restored}"`);
    const sourceUrl = new URL(url);
    sourceUrl.pathname = "/" + source;
    await apply(sourceUrl.toString());
    run(source, "seed");
    const backup = docker([
      "pg_dump",
      "-U",
      url.username,
      "-d",
      source,
      "--format=custom",
    ]);
    await writeFile(dir + "/backup.dump", backup, { mode: 0o600 });
    run(source, "delete"); // Ledger lives outside the restored backup.
    docker(
      [
        "pg_restore",
        "-U",
        url.username,
        "-d",
        restored,
        "--no-owner",
        "--exit-on-error",
      ],
      backup,
    );
    const restoreUrl = new URL(url);
    restoreUrl.pathname = "/" + restored;
    await apply(restoreUrl.toString());
    run(restored, "replay");
    console.log(
      JSON.stringify({
        drill: "isolated-synthetic-pg_dump-pg_restore",
        durationMs: performance.now() - started,
        backupBytes: backup.length,
        ledgerReplays: 2,
        accountA: "absent",
        accountB: "history-intact",
        schemaReady: true,
        outcome: "passed",
      }),
    );
  } finally {
    for (const name of [source, restored])
      await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.end();
    await rm(dir, { recursive: true, force: true });
  }
}
void main().catch(() => {
  console.error("RESTORE_DRILL_FAILED");
  process.exitCode = 1;
});
