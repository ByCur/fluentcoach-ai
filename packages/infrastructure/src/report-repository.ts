import {
  AiError,
  validateReport,
  type AnalysisTranscript,
  type ReportDraft,
  type ReportRepository,
  type ReportView,
} from '@fluentcoach/application';
import type { ConversationTurn } from '@fluentcoach/domain';
import { pool, sql } from './prisma.js';
import { PostgresSessionRepository } from './session-repository.js';
export class PostgresReportRepository implements ReportRepository {
  constructor(private readonly synthetic = false) {}
  async transcript(job: {
    analysisRunId: string;
    accountId: string;
    sessionId: string;
    transcriptRevision: number;
  }): Promise<AnalysisTranscript> {
    const rows = await sql<{ turns: ConversationTurn[]; partial: boolean }>(
      `SELECT t.turns,t.partial FROM analysis_runs a JOIN transcript_revisions t ON t.session_id=a.session_id AND t.account_id=a.account_id AND t.revision=a.transcript_revision JOIN practice_sessions s ON s.id=a.session_id AND s.account_id=a.account_id JOIN accounts owner ON owner.id=a.account_id WHERE a.id=$1 AND a.account_id=$2 AND a.session_id=$3 AND a.transcript_revision=$4 AND s.transcript_revision=a.transcript_revision AND s.state IN ('ENDED','ABANDONED','FAILED') AND owner.status='ACTIVE'`,
      [job.analysisRunId, job.accountId, job.sessionId, job.transcriptRevision],
    );
    if (!rows[0]) throw new AiError('unauthorized');
    const session = await new PostgresSessionRepository().get(
      job.accountId,
      job.sessionId,
    );
    if (!session) throw new AiError('unauthorized');
    return {
      accountId: job.accountId,
      sessionId: job.sessionId,
      revision: job.transcriptRevision,
      snapshot: session.snapshot,
      turns: rows[0].turns,
      partial: rows[0].partial,
      synthetic: this.synthetic,
    };
  }
  async view(accountId: string, sessionId: string): Promise<ReportView> {
    const session = await new PostgresSessionRepository().get(
      accountId,
      sessionId,
    );
    if (!session) throw Error('SESSION_NOT_FOUND');
    const row = (
      await sql<{
        status: string;
        error_code: string | null;
        transcript_revision: number;
        content: ReportDraft | null;
        partial: boolean | null;
        turns: ConversationTurn[];
        revision_partial: boolean;
      }>(
        `SELECT a.status,a.error_code,a.transcript_revision,r.content,r.partial,t.turns,t.partial AS revision_partial FROM analysis_runs a JOIN transcript_revisions t ON t.session_id=a.session_id AND t.account_id=a.account_id AND t.revision=a.transcript_revision LEFT JOIN session_reports r ON r.analysis_run_id=a.id AND r.account_id=a.account_id JOIN practice_sessions s ON s.id=a.session_id AND s.account_id=a.account_id WHERE a.account_id=$1 AND a.session_id=$2 AND a.transcript_revision=s.transcript_revision ORDER BY a.created_at DESC LIMIT 1`,
        [accountId, sessionId],
      )
    )[0];
    if (!row) {
      const retained=(await sql<{transcript_revision:number}>('SELECT transcript_revision FROM practice_sessions WHERE account_id=$1 AND id=$2',[accountId,sessionId]))[0];
      return {status:retained?.transcript_revision?'unavailable':'pending',partial:false,revision:retained?.transcript_revision??0};
    }
    const result: ReportView = {
      status:
        row.status === 'SUCCEEDED' && !row.content
          ? 'failed'
          : (row.status.toLowerCase() as ReportView['status']),
      partial: row.partial ?? row.revision_partial,
      revision: row.transcript_revision,
      ...(row.status === 'SUCCEEDED' && !row.content
        ? { errorCode: 'report-missing' }
        : row.error_code
          ? { errorCode: row.error_code }
          : {}),
    };
    if (row.content) {
      result.report = validateReport(row.content, {
        accountId,
        sessionId,
        revision: row.transcript_revision,
        snapshot: session.snapshot,
        turns: row.turns,
        partial: result.partial,
        synthetic: this.synthetic,
      });
    }
    return result;
  }
  async retry(accountId: string, sessionId: string) {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const row = (
        await c.query<{
          id: string;
          status: string;
          transcript_revision: number;
        }>(
          `SELECT a.id,a.status,a.transcript_revision FROM analysis_runs a JOIN practice_sessions s ON s.id=a.session_id AND s.account_id=a.account_id JOIN accounts owner ON owner.id=a.account_id WHERE a.account_id=$1 AND a.session_id=$2 AND s.transcript_revision=a.transcript_revision AND owner.status='ACTIVE' ORDER BY a.created_at DESC LIMIT 1 FOR UPDATE OF a`,
          [accountId, sessionId],
        )
      ).rows[0];
      if (!row) throw Error('SESSION_NOT_FOUND');
      const existingReport = (
        await c.query(
          'SELECT id FROM session_reports WHERE analysis_run_id=$1 AND account_id=$2',
          [row.id, accountId],
        )
      ).rowCount;
      if (
        row.status === 'FAILED' ||
        (row.status === 'SUCCEEDED' && !existingReport)
      ) {
        await c.query(
          "UPDATE analysis_runs SET status='PENDING',attempts=0,error_code=NULL,lease_until=NULL WHERE id=$1",
          [row.id],
        );
        await c.query(
          "UPDATE outbox_events SET published_at=NULL WHERE payload->>'analysisRunId'=$1",
          [row.id],
        );
      }
      await c.query('COMMIT');
    } catch (error) {
      await c.query('ROLLBACK');
      throw error;
    } finally {
      c.release();
    }
  }
}
