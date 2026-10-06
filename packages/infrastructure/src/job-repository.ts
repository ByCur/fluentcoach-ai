import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import type {
  AnalysisJob,
  AnalysisRun,
  JobStore,
  TranscriptRevisionInput,
  ReportResult,
} from '@fluentcoach/application';
import type { ConversationTurn } from '@fluentcoach/domain';
import {
  AiError,
  validateReport,
  reportObservations,
  ANALYSIS_PROMPT_VERSION,
} from '@fluentcoach/application';
import { writeIssueObservations } from './issue-repository.js';
import { PostgresReportRepository } from './report-repository.js';
import { pool, sql } from './prisma.js';
type Row = {
  id: string;
  account_id: string;
  session_id: string;
  transcript_revision: number;
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'SKIPPED';
  attempts: number;
  deletion_epoch: number;
  lease_until?: Date;
  lease_token?: string;
  error_code?: string;
};
type Session = { state: string; transcript_revision: number };
const map = (r: Row): AnalysisRun => ({
  id: r.id,
  accountId: r.account_id,
  sessionId: r.session_id,
  revision: r.transcript_revision,
  status: r.status.toLowerCase() as AnalysisRun['status'],
  attempts: r.attempts,
  deletionEpoch: r.deletion_epoch,
  ...(r.lease_token ? { leaseToken: r.lease_token } : {}),
  ...(r.lease_until ? { leaseUntil: r.lease_until } : {}),
  ...(r.error_code ? { errorCode: r.error_code } : {}),
});
async function transaction<T>(operation: (c: PoolClient) => Promise<T>) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const result = await operation(c);
    await c.query('COMMIT');
    return result;
  } catch (error) {
    await c.query('ROLLBACK');
    throw error;
  } finally {
    c.release();
  }
}
async function lockSession(
  c: PoolClient,
  accountId: string,
  sessionId: string,
) {
  await c.query('SELECT id FROM accounts WHERE id=$1 FOR UPDATE',[accountId]);
  const session = (
    await c.query<Session>(
      "SELECT s.state,s.transcript_revision FROM practice_sessions s JOIN accounts a ON a.id=s.account_id WHERE s.account_id=$1 AND s.id=$2 AND a.status='ACTIVE' FOR UPDATE OF s,a",
      [accountId, sessionId],
    )
  ).rows[0];
  if (!session) throw new Error('SESSION_NOT_FOUND');
  return session;
}
async function existing(
  c: PoolClient,
  accountId: string,
  sessionId: string,
  revision: number,
) {
  const row = (
    await c.query<Row>(
      "SELECT * FROM analysis_runs WHERE account_id=$1 AND session_id=$2 AND transcript_revision=$3 AND analyzer_version IN ($4,'analysis-v2') ORDER BY created_at DESC LIMIT 1",
      [accountId, sessionId, revision, ANALYSIS_PROMPT_VERSION],
    )
  ).rows[0];
  const outbox =
    row &&
    (
      await c.query<{ id: string }>(
        'SELECT id FROM outbox_events WHERE account_id=$1 AND dedupe_key=$2',
        [accountId, `analysis:${row.id}`],
      )
    ).rows[0];
  if (!row || !outbox) throw new Error('FINALIZATION_INCOMPLETE');
  return { run: map(row), outboxId: outbox.id };
}
function normalize(turns: ConversationTurn[]) {
  const keys = new Set<string>();
  return turns.map((t, index) => {
    if (
      t.sequence !== index + 1 ||
      !t.sourceEventKey ||
      t.sourceEventKey.length > 100 ||
      keys.has(t.sourceEventKey) ||
      !['learner', 'tutor', 'help'].includes(t.speaker) ||
      !['en', 'es'].includes(t.language) ||
      typeof t.text !== 'string' ||
      !t.text.trim()
    )
      throw new Error('INVALID_TRANSCRIPT_REVISION');
    keys.add(t.sourceEventKey);
    return {
      sequence: t.sequence,
      sourceEventKey: t.sourceEventKey,
      speaker: t.speaker,
      text: t.text,
      language: t.language,
    };
  });
}
const hash = (turns: ConversationTurn[]) =>
  createHash('sha256').update(JSON.stringify(turns)).digest('hex');
async function createRevision(
  c: PoolClient,
  accountId: string,
  sessionId: string,
  revision: number,
  sourceKey: string,
  turns: ConversationTurn[],
  partial: boolean,
) {
  await c.query(
    'INSERT INTO transcript_revisions(session_id,account_id,revision,source_key,content_hash,turns,partial) VALUES($1,$2,$3,$4,$5,$6,$7)',
    [
      sessionId,
      accountId,
      revision,
      sourceKey,
      hash(turns),
      JSON.stringify(turns),
      partial,
    ],
  );
  await c.query(
    'INSERT INTO transcript_revision_receipts(session_id,account_id,source_key,revision) VALUES($1,$2,$3,$4)',
    [sessionId, accountId, sourceKey, revision],
  );
  const hasTurns = turns.some((t) => t.speaker === 'learner');
  const run = (
    await c.query<Row>(
      'INSERT INTO analysis_runs(session_id,account_id,transcript_revision,analyzer_version,status) VALUES($1,$2,$3,$4,$5) RETURNING *',
      [
        sessionId,
        accountId,
        revision,
        ANALYSIS_PROMPT_VERSION,
        hasTurns ? 'PENDING' : 'SKIPPED',
      ],
    )
  ).rows[0]!;
  const job: AnalysisJob = {
    version: 1,
    analysisRunId: run.id,
    accountId,
    sessionId,
    transcriptRevision: revision,
    deletionEpoch: run.deletion_epoch,
  };
  const outbox = (
    await c.query<{ id: string }>(
      'INSERT INTO outbox_events(account_id,aggregate_id,event_type,envelope_version,payload,dedupe_key,published_at) VALUES($1,$2,$3,1,$4,$5,CASE WHEN $6 THEN NULL ELSE now() END) RETURNING id',
      [
        accountId,
        sessionId,
        'analysis.requested',
        job,
        `analysis:${run.id}`,
        hasTurns,
      ],
    )
  ).rows[0]!;
  return { run: map(run), outboxId: outbox.id };
}
export class PostgresJobStore implements JobStore {
  // hasTurns is advisory; persisted evidence determines whether analysis is skipped.
  finalize(i: { accountId: string; sessionId: string; hasTurns: boolean }) {
    return transaction(async (c) => {
      const session = await lockSession(c, i.accountId, i.sessionId);
      if (session.transcript_revision > 0)
        return existing(
          c,
          i.accountId,
          i.sessionId,
          session.transcript_revision,
        );
      const turns = (
        await c.query<ConversationTurn>(
          'SELECT sequence,source_event_key AS "sourceEventKey",speaker,text,language FROM conversation_turns WHERE account_id=$1 AND session_id=$2 ORDER BY sequence',
          [i.accountId, i.sessionId],
        )
      ).rows;
      const partial = ['ABANDONED', 'FAILED'].includes(session.state);
      await c.query(
        "UPDATE practice_sessions SET state=CASE WHEN state IN ('ABANDONED','FAILED') THEN state ELSE 'ENDED' END,ended_at=COALESCE(ended_at,now()),transcript_revision=1,turn_lease_token=NULL,turn_lease_until=NULL WHERE account_id=$1 AND id=$2",
        [i.accountId, i.sessionId],
      );
      return createRevision(
        c,
        i.accountId,
        i.sessionId,
        1,
        'finalization',
        normalize(turns),
        partial,
      );
    });
  }
  revise(i: TranscriptRevisionInput) {
    return transaction(async (c) => {
      const session = await lockSession(c, i.accountId, i.sessionId);
      if (
        !['ENDED', 'ABANDONED', 'FAILED'].includes(session.state) ||
        !session.transcript_revision
      )
        throw new Error('SESSION_NOT_FINALIZED');
      if (
        !i.sourceKey ||
        i.sourceKey.length > 100 ||
        i.sourceKey === 'finalization'
      )
        throw new Error('INVALID_TRANSCRIPT_REVISION');
      const turns = normalize(i.turns),
        contentHash = hash(turns);
      const byKey = (
        await c.query<{ revision: number; turns: ConversationTurn[] }>(
          'SELECT t.revision,t.turns FROM transcript_revision_receipts r JOIN transcript_revisions t ON t.session_id=r.session_id AND t.revision=r.revision AND t.account_id=r.account_id WHERE r.account_id=$1 AND r.session_id=$2 AND r.source_key=$3',
          [i.accountId, i.sessionId, i.sourceKey],
        )
      ).rows[0];
      if (byKey) {
        if (hash(normalize(byKey.turns)) !== contentHash)
          throw new Error('REVISION_KEY_CONFLICT');
        return existing(c, i.accountId, i.sessionId, byKey.revision);
      }
      // Compare canonical content, also covering snapshots backfilled by the migration.
      const revisions = (
        await c.query<{ revision: number; turns: ConversationTurn[] }>(
          'SELECT revision,turns FROM transcript_revisions WHERE account_id=$1 AND session_id=$2',
          [i.accountId, i.sessionId],
        )
      ).rows;
      const same = revisions.find(
        (r) => hash(normalize(r.turns)) === contentHash,
      );
      if (same) {
        await c.query(
          'INSERT INTO transcript_revision_receipts(session_id,account_id,source_key,revision) VALUES($1,$2,$3,$4)',
          [i.sessionId, i.accountId, i.sourceKey, same.revision],
        );
        return existing(c, i.accountId, i.sessionId, same.revision);
      }
      const revision = session.transcript_revision + 1;
      await c.query(
        'DELETE FROM issue_observations WHERE account_id=$1 AND session_id=$2',
        [i.accountId, i.sessionId],
      );
      await c.query(
        'UPDATE practice_sessions SET transcript_revision=$3 WHERE account_id=$1 AND id=$2',
        [i.accountId, i.sessionId, revision],
      );
      return createRevision(
        c,
        i.accountId,
        i.sessionId,
        revision,
        i.sourceKey,
        turns,
        session.state !== 'ENDED',
      );
    });
  }
  claim(job: AnalysisJob, now: Date, leaseUntil: Date, maxAttempts: number) {
    return transaction(async (c) => {
      const a=(await c.query<{status:string;deletion_epoch:number}>('SELECT status,deletion_epoch FROM accounts WHERE id=$1 FOR UPDATE',[job.accountId])).rows[0];
      if(!a || a.status!=='ACTIVE')return null;
      const row = (
        await c.query<Row>(
          'SELECT * FROM analysis_runs WHERE id=$1 AND account_id=$2 AND session_id=$3 AND transcript_revision=$4 FOR UPDATE',
          [
            job.analysisRunId,
            job.accountId,
            job.sessionId,
            job.transcriptRevision,
          ],
        )
      ).rows[0];
      if (!row) throw new Error('JOB_ENVELOPE_MISMATCH');
      if(row.deletion_epoch!==a.deletion_epoch || (job.deletionEpoch!==undefined && job.deletionEpoch!==a.deletion_epoch))return null;
      if (
        row.status !== 'PENDING' &&
        !(row.status === 'RUNNING' && row.lease_until && row.lease_until <= now)
      )
        return null;
      if (row.attempts >= maxAttempts) {
        await c.query(
          "UPDATE analysis_runs SET status='FAILED',lease_until=NULL,error_code='RETRIES_EXHAUSTED' WHERE id=$1",
          [row.id],
        );
        return null;
      }
      const claimed = (
        await c.query<Row>(
          "UPDATE analysis_runs SET status='RUNNING',attempts=attempts+1,lease_until=$2,lease_token=gen_random_uuid() WHERE id=$1 RETURNING *",
          [row.id, leaseUntil],
        )
      ).rows[0]!;
      return map(claimed);
    });
  }
  async succeed(
    claimed: AnalysisRun,
    providerRunId: string,
    result?: ReportResult,
  ) {
    const id = claimed.id;
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const a=(await c.query<{status:string;deletion_epoch:number}>('SELECT status,deletion_epoch FROM accounts WHERE id=$1 FOR UPDATE',[claimed.accountId])).rows[0];
      if(!a || a.status!=='ACTIVE' || a.deletion_epoch!==(claimed.deletionEpoch??0))throw new AiError('cancelled');
      const run = (
        await c.query<Row>(
          'SELECT * FROM analysis_runs WHERE id=$1 FOR UPDATE',
          [id],
        )
      ).rows[0];
      if (
        !run ||
        run.account_id !== claimed.accountId ||
        run.session_id !== claimed.sessionId ||
        run.transcript_revision !== claimed.revision
      )
        throw new AiError('unauthorized');
      if (run.status === 'SUCCEEDED') {
        await c.query('COMMIT');
        return;
      }
      if (
        run.status !== 'RUNNING' ||
        run.lease_token !== claimed.leaseToken ||
        run.attempts !== claimed.attempts ||
        run.lease_until?.getTime() !== claimed.leaseUntil?.getTime() ||
        !run.lease_until ||
        (!!result?.report && run.lease_until.getTime() < Date.now())
      )
        throw result?.report
          ? new AiError('cancelled')
          : new Error('JOB_LEASE_LOST');
      // Lock the canonical session through report commit; deletion/revision changes win over stale provider responses.
      const session = (
        await c.query<{
          state: string;
          status: string;
          transcript_revision: number;
          occurred_at: Date;
        }>(
          'SELECT s.state,s.transcript_revision,a.status,COALESCE(s.ended_at,s.created_at) AS occurred_at FROM practice_sessions s JOIN accounts a ON a.id=s.account_id WHERE s.id=$1 AND s.account_id=$2 FOR UPDATE OF s,a',
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
          'DELETE FROM issue_observations WHERE account_id=$1 AND session_id=$2',
          [run.account_id, run.session_id],
        );
        const persisted = await c.query<{ id: string }>(
          `INSERT INTO session_reports(analysis_run_id,session_id,account_id,transcript_revision,schema_version,content,partial)VALUES($1,$2,$3,$4,$5,$6,$7)ON CONFLICT(session_id,account_id)DO UPDATE SET analysis_run_id=EXCLUDED.analysis_run_id,transcript_revision=EXCLUDED.transcript_revision,schema_version=EXCLUDED.schema_version,content=EXCLUDED.content,partial=EXCLUDED.partial,generated_at=now() RETURNING id`,
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
        await writeIssueObservations(
          c,
          run.account_id,
          reportObservations(validated, transcript, {
            reportId: persisted.rows[0]!.id,
            analysisRunId: id,
            occurredAt: session.occurred_at.toISOString(),
          }),
        );
      }
      const m = result?.metadata;
      await c.query(
        "INSERT INTO provider_runs(id,account_id,analysis_run_id,session_id,operation,adapter,model,prompt_version,schema_version,outcome,latency_ms,request_id,input_tokens,output_tokens,finish_reason)VALUES($1,$2,$3,$4,'analysis',$5,$6,$7,$8,'succeeded',$9,$10,$11,$12,$13)",
        [
          providerRunId,
          run.account_id,
          id,
          run.session_id,
          m?.adapter ?? 'fake',
          m?.model ?? 'deterministic',
          m?.promptVersion ?? ANALYSIS_PROMPT_VERSION,
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
  async fail(run: AnalysisRun, code: string, retry: boolean) {
    await transaction(async (c) => {
      const a=(await c.query<{status:string}>('SELECT status FROM accounts WHERE id=$1 FOR UPDATE',[run.accountId])).rows[0];
      if(a?.status!=='ACTIVE')return;
      const updated = await c.query(
        "UPDATE analysis_runs SET status=$3,lease_until=NULL,error_code=$4 WHERE id=$1 AND account_id=$2 AND status='RUNNING' AND attempts=$5 AND lease_until=$6 AND lease_token=$7 RETURNING id",
        [
          run.id,
          run.accountId,
          retry ? 'PENDING' : 'FAILED',
          code,
          run.attempts,
          run.leaseUntil,
          run.leaseToken,
        ],
      );
      if (updated.rowCount && retry)
        await c.query(
          'UPDATE outbox_events SET published_at=NULL WHERE account_id=$1 AND dedupe_key=$2',
          [run.accountId, `analysis:${run.id}`],
        );
    });
  }
  async markPublished(id: string) {
    await sql(
      'UPDATE outbox_events SET published_at=now(),attempts=attempts+1 WHERE dedupe_key=$1',
      [`analysis:${id}`],
    );
  }
  async pending() {
    const rows = await sql<{
      payload: AnalysisJob;
    }>(`SELECT o.payload FROM outbox_events o JOIN analysis_runs a ON a.id=(o.payload->>'analysisRunId')::uuid AND a.account_id=o.account_id AND a.session_id=o.aggregate_id
      WHERE o.event_type='analysis.requested' AND ((a.status='PENDING' AND (o.published_at IS NULL OR o.published_at < now()-interval '30 seconds')) OR (a.status='RUNNING' AND a.lease_until<=now())) ORDER BY o.created_at`);
    return rows.map((r) => r.payload);
  }
}
