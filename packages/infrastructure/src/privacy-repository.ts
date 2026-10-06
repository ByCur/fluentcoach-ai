import { StructuredTelemetry } from "./telemetry.js";
import type { PoolClient } from "pg";
import type { PrivacyRepository } from "@fluentcoach/application";
import {
  PRIVACY_EXPORT_SCHEMA_VERSION,
  PRIVACY_LIMITS,
  DELETION_PROTOCOL_VERSION,
  TOMBSTONE_SCHEMA_VERSION,
  retentionCutoff,
  type PrivacyJob,
  type Tombstone,
} from "@fluentcoach/domain";
import { pool } from "./prisma.js";
// Explicit allowlist: never SELECT * from content tables into the export.
export const EXPORT_COLUMNS = {
  accounts: "id,status,created_at,updated_at",
  learner_profiles:
    "id,interface_language,native_language,timezone,cefr_level,interests,onboarding_version,version,created_at,updated_at",
  practice_goals:
    "minutes_per_day,days_per_week,effective_from,version,created_at,updated_at",
  consent_records:
    "purpose,policy_version,provider_disclosure_version,accepted_at,revoked_at",
  practice_sessions:
    "id,scenario_slug,scenario_version,level,mode,prompt_version,state,transcript_revision,created_at,ended_at",
  conversation_turns: "id,session_id,sequence,speaker,text,language,created_at",
  session_events: "session_id,sequence,kind,payload,occurred_at",
  transcript_revisions: "session_id,revision,turns,partial,created_at",
  analysis_runs:
    "session_id,transcript_revision,analyzer_version,status,created_at",
  session_reports:
    "id,session_id,transcript_revision,schema_version,content,partial,generated_at",
  issue_observations:
    "taxonomy_version,issue_key,label,category,session_id,report_id,transcript_revision,turn_sequence,evidence_start,evidence_end,quote,uncertainty,occurred_at",
  issue_dismissals: "taxonomy_version,issue_key,dismissed_at,restored_at",
  vocabulary_suggestions:
    "id,phrase,meaning,source_session_id,source_report_id,source_revision,evidence,origin_version,state,source_available,card_id,created_at,updated_at",
  vocabulary_cards:
    "id,phrase,meaning,source_suggestion_id,source_session_id,source_report_id,source_revision,source_available,state,scheduler_version,due_at,interval_minutes,repetitions,version,created_at,updated_at",
  vocabulary_review_events:
    "id,card_id,scheduler_version,previous_state,rating,reviewed_at,resulting_state,next_due_at,timezone_at_event,local_date,created_at",
  learning_plans:
    "id,schema_version,generator_version,catalog_version,version,state,source_snapshot,rationale,insufficient_data,created_at,accepted_at",
  learning_plan_activities:
    "id,plan_id,catalog_version,candidate_id,activity_type,definition,state,started_at,session_id",
  practice_events:
    "id,session_id,kind,duration_ms,occurred_at,timezone_at_event,local_date",
} as const;
type JobRow = {
  id: string;
  account_id: string;
  kind: PrivacyJob["kind"];
  version: string;
  state: PrivacyJob["state"];
  deletion_epoch: number;
  attempts: number;
  created_at: Date;
  completed_at: Date | null;
  error_code: string | null;
  expires_at?: Date | null;
};
const view = (r: JobRow): PrivacyJob => ({
  id: r.id,
  kind: r.kind,
  version: r.version,
  state: r.state,
  createdAt: r.created_at.toISOString(),
  completedAt: r.completed_at?.toISOString() ?? null,
  errorCode: r.error_code,
  expiresAt: r.expires_at?.toISOString() ?? null,
});
async function tx<T>(fn: (c: PoolClient) => Promise<T>, repeatable = false) {
  const c = await pool.connect();
  try {
    await c.query(
      repeatable ? "BEGIN ISOLATION LEVEL REPEATABLE READ" : "BEGIN",
    );
    const value = await fn(c);
    await c.query("COMMIT");
    return value;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
async function owner(c: PoolClient, id: string, active = true) {
  const a = (
    await c.query<{ deletion_epoch: number; status: string }>(
      "SELECT deletion_epoch,status FROM accounts WHERE id=$1 FOR UPDATE",
      [id],
    )
  ).rows[0];
  if (!a || (active && a.status !== "ACTIVE")) throw Error("ACCOUNT_DELETING");
  return a;
}
async function purgeAccount(c: PoolClient, id: string) {
  // Break source/provenance cycles before cascades. Jobs/ledger are content-free.
  await c.query("DELETE FROM practice_events WHERE account_id=$1", [id]);
  await c.query("DELETE FROM vocabulary_suggestions WHERE account_id=$1", [id]);
  await c.query("DELETE FROM vocabulary_cards WHERE account_id=$1", [id]);
  await c.query("DELETE FROM learning_plans WHERE account_id=$1", [id]);
  await c.query("DELETE FROM provider_runs WHERE account_id=$1", [id]);
  await c.query(
    "DELETE FROM privacy_jobs WHERE account_id=$1 AND kind='export'",
    [id],
  );
  await c.query("DELETE FROM accounts WHERE id=$1", [id]);
}
export class PostgresPrivacyRepository implements PrivacyRepository {
  constructor(
    private readonly maxBytes = PRIVACY_LIMITS.exportMaxBytes,
    private readonly fault?: (phase: string) => void,
  ) {
    if (
      !Number.isSafeInteger(maxBytes) ||
      maxBytes < 1024 ||
      maxBytes > 64 * 1024 * 1024
    )
      throw Error("INVALID_EXPORT_LIMIT");
  }
  requestExport(accountId: string, requestKey: string) {
    return tx(async (c) => {
      const a = await owner(c, accountId);
      const existing = (
        await c.query<JobRow>(
          "SELECT * FROM privacy_jobs WHERE account_id=$1 AND kind='export' AND request_key=$2",
          [accountId, requestKey],
        )
      ).rows[0];
      if (existing) return view(existing);
      const recent = (
        await c.query<{ count: number }>(
          "SELECT count(*)::int count FROM privacy_jobs WHERE account_id=$1 AND kind='export' AND created_at>now()-interval '1 day'",
          [accountId],
        )
      ).rows[0]!.count;
      if (
        recent >= PRIVACY_LIMITS.exportRequestsPerDay ||
        (
          await c.query(
            "SELECT 1 FROM privacy_jobs WHERE account_id=$1 AND kind='export' AND state='pending'",
            [accountId],
          )
        ).rowCount
      )
        throw Error("PRIVACY_JOB_CONFLICT");
      return view(
        (
          await c.query<JobRow>(
            "INSERT INTO privacy_jobs(account_id,kind,request_key,deletion_epoch) VALUES($1,'export',$2,$3) RETURNING *",
            [accountId, requestKey, a.deletion_epoch],
          )
        ).rows[0]!,
      );
    });
  }
  status(accountId: string, id: string) {
    return tx(async (c) => {
      await owner(c, accountId);
      const r = (
        await c.query<JobRow>(
          "SELECT j.*,a.expires_at FROM privacy_jobs j LEFT JOIN privacy_export_artifacts a ON a.job_id=j.id WHERE j.account_id=$1 AND j.id=$2",
          [accountId, id],
        )
      ).rows[0];
      if (!r) throw Error("EXPORT_NOT_FOUND");
      return view(r);
    });
  }
  download(accountId: string, id: string) {
    return tx(async (c) => {
      await owner(c, accountId);
      const r = (
        await c.query<{ content: unknown; expires_at: Date }>(
          "SELECT content,expires_at FROM privacy_export_artifacts WHERE account_id=$1 AND job_id=$2 AND expires_at>clock_timestamp()",
          [accountId, id],
        )
      ).rows[0];
      if (!r) throw Error("EXPORT_NOT_FOUND");
      return JSON.stringify(r.content);
    });
  }
  requestDeletion(accountId: string, requestKey: string) {
    return tx(async (c) => {
      const a = await owner(c, accountId, false);
      const existing = (
        await c.query<JobRow>(
          "SELECT * FROM privacy_jobs WHERE account_id=$1 AND kind='deletion'",
          [accountId],
        )
      ).rows[0];
      if (existing) return view(existing);
      if (a.status !== "ACTIVE") throw Error("ACCOUNT_DELETING");
      // Neutralize leases while owner is active, then atomically revoke and publish tombstone/job.
      await c.query(
        "UPDATE analysis_runs SET status='SKIPPED',lease_token=NULL,lease_until=NULL,error_code='ACCOUNT_DELETING' WHERE account_id=$1 AND status IN ('PENDING','RUNNING')",
        [accountId],
      );
      await c.query(
        "UPDATE practice_sessions SET turn_lease_token=NULL,turn_lease_until=NULL WHERE account_id=$1",
        [accountId],
      );
      await c.query("DELETE FROM outbox_events WHERE account_id=$1", [
        accountId,
      ]);
      await c.query(
        "DELETE FROM privacy_jobs WHERE account_id=$1 AND kind='export'",
        [accountId],
      );
      await c.query(
        "UPDATE accounts SET status='DELETING',deletion_epoch=deletion_epoch+1,updated_at=now() WHERE id=$1",
        [accountId],
      );
      await c.query(
        "INSERT INTO deletion_tombstones(account_id,deletion_epoch,requested_at,protocol_version,schema_version) VALUES($1,$2,now(),$3,$4)",
        [
          accountId,
          a.deletion_epoch + 1,
          DELETION_PROTOCOL_VERSION,
          TOMBSTONE_SCHEMA_VERSION,
        ],
      );
      return view(
        (
          await c.query<JobRow>(
            "INSERT INTO privacy_jobs(account_id,kind,request_key,deletion_epoch) VALUES($1,'deletion',$2,$3) RETURNING *",
            [accountId, requestKey, a.deletion_epoch + 1],
          )
        ).rows[0]!,
      );
    });
  }
  async execute(id: string) {
    const started = Date.now();
    let kind: PrivacyJob["kind"] = "export";
    try {
      await tx(async (c) => {
        // Account-first lock ordering shared with learner writers and deletion requests.
        const hint = (
          await c.query<JobRow>("SELECT * FROM privacy_jobs WHERE id=$1", [id])
        ).rows[0];
        if (!hint || hint.state !== "pending") return;
        kind = hint.kind;
        const a = (
          await c.query<{ status: string; deletion_epoch: number }>(
            "SELECT status,deletion_epoch FROM accounts WHERE id=$1 FOR UPDATE",
            [hint.account_id],
          )
        ).rows[0];
        const j = (
          await c.query<JobRow>(
            "SELECT * FROM privacy_jobs WHERE id=$1 FOR UPDATE",
            [id],
          )
        ).rows[0];
        if (!j || j.state !== "pending") return;
        if (
          !a ||
          a.deletion_epoch !== j.deletion_epoch ||
          (j.kind === "export"
            ? a.status !== "ACTIVE"
            : a.status !== "DELETING")
        )
          throw Error("ACCOUNT_DELETING");
        await c.query("UPDATE privacy_jobs SET started_at=now() WHERE id=$1", [
          id,
        ]);
        if (j.kind === "deletion") {
          await purgeAccount(c, j.account_id);
          this.fault?.("deletion");
          await c.query(
            "UPDATE deletion_tombstones SET completed_at=now() WHERE account_id=$1",
            [j.account_id],
          );
        } else {
          const data: Record<string, unknown> = {
            schemaVersion: PRIVACY_EXPORT_SCHEMA_VERSION,
            exportedAt: (
              await c.query<{ now: Date }>("SELECT transaction_timestamp() now")
            ).rows[0]!.now.toISOString(),
          };
          let used = 0;
          for (const [table, columns] of Object.entries(EXPORT_COLUMNS)) {
            const key = table === "accounts" ? "id" : "account_id";
            // Conservative source-size check before JSON materialization, plus exact output bound.
            const size = (
              await c.query<{ size: string }>(
                `SELECT COALESCE(sum(octet_length(row_to_json(t)::text)),0)::text size FROM ${table} t WHERE ${key}=$1`,
                [j.account_id],
              )
            ).rows[0]!.size;
            used += Number(size);
            if (used > this.maxBytes) throw Error("EXPORT_TOO_LARGE");
            data[table] = (
              await c.query(
                `SELECT ${columns} FROM ${table} WHERE ${key}=$1 ORDER BY to_jsonb(${table})::text`,
                [j.account_id],
              )
            ).rows;
          }
          this.fault?.("export");
          const json = JSON.stringify(data);
          const bytes = Buffer.byteLength(json);
          if (bytes > this.maxBytes) throw Error("EXPORT_TOO_LARGE");
          await c.query(
            "INSERT INTO privacy_export_artifacts(job_id,account_id,content,size_bytes,expires_at) VALUES($1,$2,$3,$4,now()+interval '24 hours')",
            [id, j.account_id, json, bytes],
          );
        }
        await c.query(
          "UPDATE privacy_jobs SET state='completed',completed_at=now(),error_code=NULL WHERE id=$1",
          [id],
        );
      }, true);
      new StructuredTelemetry().record({
        operation: kind,
        outcome: "success",
        durationMs: Date.now() - started,
        count: 1,
      });
    } catch (e) {
      new StructuredTelemetry().record({
        operation: kind,
        outcome: "failure",
        durationMs: Date.now() - started,
        count: 1,
      });
      const code =
        e instanceof Error && e.message === "EXPORT_TOO_LARGE"
          ? "EXPORT_TOO_LARGE"
          : "PRIVACY_ATTEMPT_FAILED";
      await pool.query(
        "UPDATE privacy_jobs SET attempts=attempts+1,state=CASE WHEN attempts+1>=3 OR $2='EXPORT_TOO_LARGE' THEN 'failed' ELSE 'pending' END,error_code=$2 WHERE id=$1 AND state='pending' AND attempts<3",
        [id, code],
      );
    }
  }
  async reconcile() {
    await pool.query(
      "DELETE FROM privacy_export_artifacts WHERE expires_at<=clock_timestamp()",
    );
    const rows = (
      await pool.query<{ id: string }>(
        "SELECT id FROM privacy_jobs WHERE state='pending' ORDER BY created_at LIMIT 25",
      )
    ).rows;
    for (const r of rows) await this.execute(r.id);
  }
  async retain() {
    const now = (
      await pool.query<{ now: Date }>("SELECT clock_timestamp() now")
    ).rows[0]!.now;
    return this.retainAt(now);
  }
  // Injectable server clock for deterministic integration boundaries; never browser supplied.
  async retainAt(now: Date) {
    const cutoff = retentionCutoff(now);
    const ids = (
      await pool.query<{ account_id: string }>(
        "SELECT DISTINCT account_id FROM practice_sessions WHERE COALESCE(ended_at,created_at)<$1 AND EXISTS(SELECT 1 FROM accounts a WHERE a.id=account_id AND a.status='ACTIVE') ORDER BY account_id",
        [cutoff],
      )
    ).rows;
    let sessions = 0,
      accounts = 0;
    for (const { account_id: id } of ids) {
      let affected = false;
      for (;;) {
        const n = await tx(async (c) => {
          const a = (
            await c.query<{ status: string }>(
              "SELECT status FROM accounts WHERE id=$1 FOR UPDATE",
              [id],
            )
          ).rows[0];
          if (a?.status !== "ACTIVE") return 0;
          const old = (
            await c.query<{ id: string }>(
              "SELECT id FROM practice_sessions s WHERE account_id=$1 AND COALESCE(ended_at,created_at)<$2 AND (EXISTS(SELECT 1 FROM conversation_turns WHERE session_id=s.id) OR EXISTS(SELECT 1 FROM transcript_revisions WHERE session_id=s.id) OR EXISTS(SELECT 1 FROM session_events WHERE session_id=s.id) OR EXISTS(SELECT 1 FROM session_reports WHERE session_id=s.id)) ORDER BY id LIMIT $3 FOR UPDATE",
              [id, cutoff, PRIVACY_LIMITS.retentionBatch],
            )
          ).rows.map((r) => r.id);
          if (!old.length) return 0;
          await c.query("SET LOCAL app.retention_policy = 'retention-v1'");
          await c.query(
            "UPDATE practice_events SET turn_id=NULL WHERE account_id=$1 AND session_id=ANY($2::uuid[]) AND turn_id IS NOT NULL",
            [id, old],
          );
          await c.query(
            "DELETE FROM privacy_export_artifacts WHERE account_id=$1",
            [id],
          );
          // Structured cards/reviews remain; all source-derived suggestion content is removed.
          await c.query(
            "UPDATE vocabulary_cards SET source_available=false,source_suggestion_id=NULL,source_session_id=NULL,source_report_id=NULL,source_revision=NULL WHERE account_id=$1 AND source_session_id=ANY($2::uuid[])",
            [id, old],
          );
          await c.query(
            "DELETE FROM vocabulary_suggestions WHERE account_id=$1 AND source_session_id=ANY($2::uuid[])",
            [id, old],
          );
          // Conservative invalidation: remove all old copied evidence from account plan snapshots.
          await c.query(
            "UPDATE learning_plans SET source_snapshot=jsonb_set(source_snapshot,'{issues}','[]'),rationale='Las fuentes de este plan ya no están disponibles.' WHERE account_id=$1",
            [id],
          );
          await c.query(
            "UPDATE learning_plan_activities SET definition=(definition-'evidence'-'cardIds'),state='unavailable' WHERE account_id=$1 AND activity_type<>'conversation'",
            [id],
          );
          await c.query(
            "UPDATE practice_sessions SET state=CASE WHEN state IN ('CREATED','ACTIVE') THEN 'FAILED'::\"SessionState\" ELSE state END,turn_lease_token=NULL,turn_lease_until=NULL WHERE account_id=$1 AND id=ANY($2::uuid[])",
            [id, old],
          );
          for (const table of [
            "outbox_events",
            "session_reports",
            "provider_runs",
            "analysis_runs",
            "transcript_revisions",
            "session_events",
            "conversation_turns",
          ]) {
            const key =
              table === "outbox_events" ? "aggregate_id" : "session_id";
            await c.query(
              `DELETE FROM ${table} WHERE account_id=$1 AND ${key}=ANY($2::uuid[])`,
              [id, old],
            );
          }
          this.fault?.("retention");
          return old.length;
        });
        if (!n) break;
        sessions += n;
        affected = true;
      }
      if (affected) accounts++;
    }
    await pool.query(
      "DELETE FROM privacy_export_artifacts WHERE expires_at<=clock_timestamp()",
    );
    new StructuredTelemetry().record({
      operation: "retention",
      outcome: "success",
      count: sessions,
    });
    return { accounts, sessions };
  }
  async exportTombstones(): Promise<Tombstone[]> {
    const rows = (
      await pool.query<{
        account_id: string;
        deletion_epoch: number;
        requested_at: Date;
        completed_at: Date | null;
        protocol_version: typeof DELETION_PROTOCOL_VERSION;
        schema_version: typeof TOMBSTONE_SCHEMA_VERSION;
      }>("SELECT * FROM deletion_tombstones ORDER BY account_id")
    ).rows;
    return rows.map((r) => ({
      accountId: r.account_id,
      deletionEpoch: r.deletion_epoch,
      requestedAt: r.requested_at.toISOString(),
      completedAt: r.completed_at?.toISOString() ?? null,
      protocolVersion: r.protocol_version,
      schemaVersion: r.schema_version,
    }));
  }
  async replay(tombstones: Tombstone[]) {
    for (const t of tombstones) {
      if (
        t.schemaVersion !== TOMBSTONE_SCHEMA_VERSION ||
        t.protocolVersion !== DELETION_PROTOCOL_VERSION ||
        !Number.isSafeInteger(t.deletionEpoch) ||
        t.deletionEpoch < 1 ||
        !Number.isFinite(Date.parse(t.requestedAt))
      )
        throw Error("INVALID_TOMBSTONE");
      await tx(async (c) => {
        await c.query("SELECT id FROM accounts WHERE id=$1 FOR UPDATE", [
          t.accountId,
        ]);
        await purgeAccount(c, t.accountId);
        this.fault?.("replay");
        await c.query(
          "INSERT INTO deletion_tombstones(account_id,deletion_epoch,requested_at,completed_at,protocol_version,schema_version) VALUES($1,$2,$3,COALESCE($4::timestamptz,now()),$5,$6) ON CONFLICT(account_id) DO UPDATE SET deletion_epoch=GREATEST(deletion_tombstones.deletion_epoch,EXCLUDED.deletion_epoch),completed_at=COALESCE(deletion_tombstones.completed_at,EXCLUDED.completed_at)",
          [
            t.accountId,
            t.deletionEpoch,
            t.requestedAt,
            t.completedAt,
            t.protocolVersion,
            t.schemaVersion,
          ],
        );
      });
    }
  }
}
