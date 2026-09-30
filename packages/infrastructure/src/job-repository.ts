import {
  AiError,
  validateReport,
  type AnalysisJob,
  type AnalysisRun,
  type JobStore,
  type ReportResult,
} from '@fluentcoach/application';
import { PostgresReportRepository } from './report-repository.js';
import { pool, sql } from './prisma.js';
type Row = {
  id: string;
  account_id: string;
  session_id: string;
  transcript_revision: number;
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'SKIPPED';
  attempts: number;
  lease_until: Date | undefined;
  lease_token: string | undefined;
  error_code: string | undefined;
};
const map = (r: Row): AnalysisRun => ({
  id: r.id,
  accountId: r.account_id,
  sessionId: r.session_id,
  revision: r.transcript_revision,
  status: r.status.toLowerCase() as AnalysisRun['status'],
  attempts: r.attempts,
  ...(r.lease_token ? { leaseToken: r.lease_token } : {}),
  ...(r.lease_until ? { leaseUntil: r.lease_until } : {}),
  ...(r.error_code ? { errorCode: r.error_code } : {}),
});
export class PostgresJobStore implements JobStore {
  async finalize(i: {
    accountId: string;
    sessionId: string;
    hasTurns: boolean;
  }) {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const session = (
        await c.query<{ state: string; transcript_revision: number }>(
          "SELECT s.state,s.transcript_revision FROM practice_sessions s JOIN accounts a ON a.id=s.account_id WHERE s.account_id=$1 AND s.id=$2 AND a.status='ACTIVE' FOR UPDATE OF s,a",
          [i.accountId, i.sessionId],
        )
      ).rows[0];
      if (!session) throw Error('SESSION_NOT_FOUND');
      if (session.state === 'ENDED') {
        const existing = (
          await c.query<Row>(
            'SELECT * FROM analysis_runs WHERE account_id=$1 AND session_id=$2 AND transcript_revision=$3 ORDER BY created_at DESC LIMIT 1',
            [i.accountId, i.sessionId, session.transcript_revision],
          )
        ).rows[0];
        if (!existing) throw Error('FINALIZATION_INCOMPLETE');
        const outbox = (
          await c.query<{ id: string }>(
            'SELECT id FROM outbox_events WHERE dedupe_key=$1',
            [`analysis:${existing.id}`],
          )
        ).rows[0];
        if (!outbox) throw Error('FINALIZATION_INCOMPLETE');
        await c.query('COMMIT');
        return { run: map(existing), outboxId: outbox.id };
      }
      const hasTurns =
        i.hasTurns ||
        (
          await c.query<{ has_turns: boolean }>(
            "SELECT EXISTS(SELECT 1 FROM conversation_turns WHERE session_id=$1 AND account_id=$2 AND speaker='learner') AS has_turns",
            [i.sessionId, i.accountId],
          )
        ).rows[0]!.has_turns;
      const revision = session.transcript_revision + 1;
      await c.query(
        `UPDATE practice_sessions SET state='ENDED',ended_at=now(),transcript_revision=$3,turn_lease_token=NULL,turn_lease_until=NULL WHERE account_id=$1 AND id=$2`,
        [i.accountId, i.sessionId, revision],
      );
      const run = (
        await c.query<Row>(
          'INSERT INTO analysis_runs(session_id,account_id,transcript_revision,analyzer_version,status)VALUES($1,$2,$3,$4,$5) RETURNING *',
          [
            i.sessionId,
            i.accountId,
            revision,
            'analysis-v2',
            hasTurns ? 'PENDING' : 'SKIPPED',
          ],
        )
      ).rows[0]!;
      const outbox = (
        await c.query<{ id: string }>(
          'INSERT INTO outbox_events(account_id,aggregate_id,event_type,envelope_version,payload,dedupe_key,published_at)VALUES($1,$2,$3,1,$4,$5,CASE WHEN $6 THEN NULL ELSE now() END) RETURNING id',
          [
            i.accountId,
            i.sessionId,
            'analysis.requested',
            {
              version: 1,
              analysisRunId: run.id,
              accountId: i.accountId,
              sessionId: i.sessionId,
              transcriptRevision: revision,
            },
            `analysis:${run.id}`,
            hasTurns,
          ],
        )
      ).rows[0]!;
      await c.query('COMMIT');
      return { run: map(run), outboxId: outbox.id };
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }
  async claim(id: string, now: Date, leaseUntil: Date, expected?: AnalysisJob) {
    const r = (
      await sql<Row>(
        `UPDATE analysis_runs SET status='RUNNING',attempts=attempts+1,lease_until=$2,lease_token=gen_random_uuid() WHERE id=$1 AND ($4::uuid IS NULL OR (account_id=$4 AND session_id=$5 AND transcript_revision=$6)) AND attempts<3 AND (status='PENDING' OR (status='RUNNING' AND lease_until<$3)) RETURNING *`,
        [
          id,
          leaseUntil,
          now,
          expected?.accountId ?? null,
          expected?.sessionId ?? null,
          expected?.transcriptRevision ?? null,
        ],
      )
    )[0];
    return r ? map(r) : null;
  }
  async succeed(
    id: string,
    providerRunId: string,
    result?: ReportResult,
    attempt?: number,
    leaseToken?: string,
  ) {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const run = (
        await c.query<Row>(
          'SELECT * FROM analysis_runs WHERE id=$1 FOR UPDATE',
          [id],
        )
      ).rows[0];
      if (!run) throw new AiError('unauthorized');
      if (run.status === 'SUCCEEDED') {
        await c.query('COMMIT');
        return;
      }
      if (
        run.status !== 'RUNNING' ||
        (leaseToken !== undefined && run.lease_token !== leaseToken) ||
        (attempt !== undefined && run.attempts !== attempt) ||
        !run.lease_until ||
        run.lease_until.getTime() < Date.now()
      )
        throw new AiError('cancelled');
      // Lock the canonical session through report commit; deletion/revision changes win over stale provider responses.
      const session = (
        await c.query<{
          state: string;
          status: string;
          transcript_revision: number;
        }>(
          'SELECT s.state,s.transcript_revision,a.status FROM practice_sessions s JOIN accounts a ON a.id=s.account_id WHERE s.id=$1 AND s.account_id=$2 FOR UPDATE OF s,a',
          [run.session_id, run.account_id],
        )
      ).rows[0];
      if (
        !session ||
        session.status !== 'ACTIVE' ||
        session.transcript_revision !== run.transcript_revision
      )
        throw new AiError('unauthorized');
      if (result?.report) {
        const transcript = await new PostgresReportRepository().transcript({
          analysisRunId: id,
          accountId: run.account_id,
          sessionId: run.session_id,
          transcriptRevision: run.transcript_revision,
        });
        const validated = validateReport(result.report, transcript);
        await c.query(
          `INSERT INTO session_reports(analysis_run_id,session_id,account_id,transcript_revision,schema_version,content,partial)VALUES($1,$2,$3,$4,$5,$6,$7)ON CONFLICT(session_id,account_id)DO UPDATE SET analysis_run_id=EXCLUDED.analysis_run_id,transcript_revision=EXCLUDED.transcript_revision,schema_version=EXCLUDED.schema_version,content=EXCLUDED.content,partial=EXCLUDED.partial,generated_at=now()`,
          [
            id,
            run.session_id,
            run.account_id,
            run.transcript_revision,
            validated.schemaVersion,
            validated,
            transcript.partial,
          ],
        );
      }
      const m = result?.metadata;
      await c.query(
        "INSERT INTO provider_runs(id,account_id,analysis_run_id,session_id,operation,adapter,model,prompt_version,schema_version,outcome,latency_ms,request_id,input_tokens,output_tokens,finish_reason)VALUES($1,$2,$3,$4,'analysis',$5,$6,$7,$8,'succeeded',$9,$10,$11,$12,$13)ON CONFLICT(id)DO NOTHING",
        [
          providerRunId,
          run.account_id,
          id,
          run.session_id,
          m?.adapter ?? 'fake',
          m?.model ?? 'deterministic',
          m?.promptVersion ?? 'analysis-v2',
          m?.schemaVersion ?? 'report-v1',
          m?.latencyMs ?? 0,
          m?.requestId ?? null,
          m?.inputTokens ?? null,
          m?.outputTokens ?? null,
          m?.finishReason ?? null,
        ],
      );
      await c.query(
        "UPDATE analysis_runs SET status='SUCCEEDED',lease_until=NULL,error_code=NULL WHERE id=$1",
        [id],
      );
      await c.query('COMMIT');
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }
  async fail(
    id: string,
    code: string,
    retry: boolean,
    attempt?: number,
    leaseToken?: string,
  ) {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const changed = await c.query(
        `UPDATE analysis_runs SET status=$2,lease_until=NULL,error_code=$3 WHERE id=$1 AND status='RUNNING' AND ($4::int IS NULL OR attempts=$4) AND ($5::uuid IS NULL OR lease_token=$5) RETURNING id`,
        [
          id,
          retry ? 'PENDING' : 'FAILED',
          code,
          attempt ?? null,
          leaseToken ?? null,
        ],
      );
      if (retry && changed.rowCount)
        await c.query(
          "UPDATE outbox_events SET published_at=NULL WHERE payload->>'analysisRunId'=$1",
          [id],
        );
      await c.query('COMMIT');
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }
  async markPublished(id: string) {
    await sql(
      "UPDATE outbox_events SET published_at=now(),attempts=attempts+1 WHERE payload->>'analysisRunId'=$1 AND published_at IS NULL",
      [id],
    );
  }
  async pending() {
    await sql(
      "UPDATE outbox_events o SET published_at=NULL FROM analysis_runs a WHERE o.payload->>'analysisRunId'=a.id::text AND ((a.status='RUNNING' AND a.lease_until<now()) OR (a.status='PENDING' AND o.published_at<now()-interval '30 seconds'))",
    );
    await sql(
      "UPDATE analysis_runs SET status='PENDING',lease_until=NULL WHERE status='RUNNING' AND lease_until<now() AND attempts<3",
    );
    await sql(
      "UPDATE analysis_runs SET status='FAILED',lease_until=NULL,error_code='timeout' WHERE status='RUNNING' AND lease_until<now() AND attempts>=3",
    );
    const rows = await sql<{ payload: AnalysisJob }>(
      `SELECT o.payload FROM outbox_events o JOIN analysis_runs a ON a.id=(o.payload->>'analysisRunId')::uuid AND a.account_id=o.account_id WHERE o.published_at IS NULL AND o.event_type='analysis.requested' AND a.status='PENDING' ORDER BY o.created_at`,
    );
    return rows.map((r) => r.payload);
  }
}
