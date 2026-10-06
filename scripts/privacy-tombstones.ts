import { readFile, writeFile } from "node:fs/promises";
import {
  PostgresPrivacyRepository,
  pool,
  schemaReady,
} from "@fluentcoach/infrastructure";
import type { Tombstone } from "@fluentcoach/domain";
const [command, file] = process.argv.slice(2);
async function main() {
  if (!file)
    throw Error("Usage: privacy:tombstones:export|replay -- ledger.json");
  const privacy = new PostgresPrivacyRepository();
  if (command === "export")
    await writeFile(
      file,
      JSON.stringify(await privacy.exportTombstones(), null, 2) + "\n",
      { mode: 0o600, flag: "wx" },
    );
  else if (command === "replay") {
    if (
      process.env["PRIVACY_RESTORE_ISOLATED"] !== "1" ||
      !/_restore(?:_|$)/.test(new URL(process.env["DATABASE_URL"]!).pathname)
    )
      throw Error(
        "Replay requires PRIVACY_RESTORE_ISOLATED=1 and an isolated _restore database",
      );
    const ledger: unknown = JSON.parse(await readFile(file, "utf8"));
    if (!Array.isArray(ledger) || ledger.length > 100000)
      throw Error("INVALID_TOMBSTONE_LEDGER");
    await privacy.replay(ledger as Tombstone[]);
    if (!(await schemaReady())) throw Error("RESTORE_NOT_READY");
    for (const t of ledger as Tombstone[]) {
      const result = await pool.query("SELECT 1 FROM accounts WHERE id=$1", [
        t.accountId,
      ]);
      if (result.rowCount) throw Error("RESTORE_PRIVACY_FAILED");
    }
  } else throw Error("Unknown tombstone operation");
  console.log(JSON.stringify({ operation: "tombstones", outcome: "success" }));
}
async function run() {
  try {
    await main();
  } catch {
    console.error("TOMBSTONE_OPERATION_FAILED");
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
void run();
