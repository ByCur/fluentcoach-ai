import type { PoolClient } from 'pg';
import {
  AiError,
  reportObservations,
  type AnalysisTranscript,
  type IssueRepository,
} from '@fluentcoach/application';
import {
  ISSUE_TAXONOMY_VERSION,
  recurringIssues,
  taxonomyIssue,
  type IssueObservation,
  type SessionSnapshot,
} from '@fluentcoach/domain';
import { pool } from './prisma.js';

export async function writeIssueObservations(
  c: PoolClient,
  accountId: string,
  observations: readonly IssueObservation[],
) {
  for (const o of observations) {
    await c.query(
      `INSERT INTO issue_observations(account_id,taxonomy_version,issue_key,label,category,session_id,report_id,analysis_run_id,transcript_revision,turn_sequence,evidence_start,evidence_end,quote,uncertainty,occurred_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        accountId,
        o.taxonomyVersion,
        o.issueKey,
        o.label,
        o.category,
        o.sessionId,
        o.reportId,
        o.analysisRunId,
        o.revision,
        o.evidence.turnSequence,
        o.evidence.start,
        o.evidence.end,
        o.evidence.quote,
        o.uncertainty,
        o.occurredAt,
      ],
    );
  }
}
/** Serialized with report persistence by the existing account row lock. No AI call, no aggregate cache. */
async function rebuild(
  c: PoolClient,
  accountId: string,
): Promise<IssueObservation[]> {
  const rows = (
    await c.query<{
      report_id: string;
      analysis_run_id: string;
      session_id: string;
      transcript_revision: number;
      content: unknown;
      turns: AnalysisTranscript['turns'];
      partial: boolean;
      occurred_at: Date;
      scenario_slug: string;
      scenario_version: number;
      level: SessionSnapshot['level'];
      mode: string;
      prompt_version: string;
    }>(
      `SELECT r.id AS report_id,r.analysis_run_id,r.session_id,r.transcript_revision,r.content,t.turns,r.partial,
      COALESCE(s.ended_at,s.created_at) AS occurred_at,s.scenario_slug,s.scenario_version,s.level,s.mode,s.prompt_version
    FROM session_reports r JOIN practice_sessions s ON s.id=r.session_id AND s.account_id=r.account_id AND s.transcript_revision=r.transcript_revision
    JOIN transcript_revisions t ON t.session_id=r.session_id AND t.account_id=r.account_id AND t.revision=r.transcript_revision
    JOIN analysis_runs a ON a.id=r.analysis_run_id AND a.account_id=r.account_id AND a.session_id=r.session_id AND a.transcript_revision=r.transcript_revision AND a.status='SUCCEEDED'
    WHERE r.account_id=$1 AND s.state IN ('ENDED','ABANDONED','FAILED') ORDER BY r.session_id`,
      [accountId],
    )
  ).rows;
  const observations: IssueObservation[] = [];
  for (const row of rows) {
    try {
      observations.push(
        ...reportObservations(
          row.content,
          {
            accountId,
            sessionId: row.session_id,
            revision: row.transcript_revision,
            snapshot: {
              scenarioSlug: row.scenario_slug,
              scenarioVersion: row.scenario_version,
              level: row.level,
              mode: row.mode.toLowerCase() as SessionSnapshot['mode'],
              promptVersion: row.prompt_version,
            },
            turns: row.turns,
            partial: row.partial,
            synthetic: false,
          },
          {
            reportId: row.report_id,
            analysisRunId: row.analysis_run_id,
            occurredAt: row.occurred_at.toISOString(),
          },
        ),
      );
    } catch (error) {
      if (
        !(error instanceof AiError) ||
        !['invalid-output', 'invalid-evidence'].includes(error.code)
      )
        throw error;
      // Fail closed for an invalid canonical report, removing all its prior observations.
    }
  }
  await c.query('DELETE FROM issue_observations WHERE account_id=$1', [
    accountId,
  ]);
  await writeIssueObservations(c, accountId, observations);
  return observations;
}
export class PostgresIssueRepository implements IssueRepository {
  private async transaction<T>(
    accountId: string,
    operation: (c: PoolClient) => Promise<T>,
  ) {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const owner = await c.query(
        "SELECT id FROM accounts WHERE id=$1 AND status='ACTIVE' FOR UPDATE",
        [accountId],
      );
      if (!owner.rowCount) throw new AiError('unauthorized');
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
  /** Also repairs pre-M07 reports, missing observations, invalid evidence and removed sources. */
  list(accountId: string) {
    return this.transaction(accountId, async (c) => {
      const observations = await rebuild(c, accountId);
      const dismissed = (
        await c.query<{ issue_key: string }>(
          'SELECT issue_key FROM issue_dismissals WHERE account_id=$1 AND taxonomy_version=$2 AND restored_at IS NULL',
          [accountId, ISSUE_TAXONOMY_VERSION],
        )
      ).rows;
      const now = (
        await c.query<{ now: Date }>('SELECT CURRENT_TIMESTAMP AS now')
      ).rows[0]!.now;
      return recurringIssues(
        observations,
        new Set(dismissed.map((r) => r.issue_key)),
        now,
      );
    });
  }
  setDismissed(accountId: string, key: string, dismissed: boolean) {
    taxonomyIssue(ISSUE_TAXONOMY_VERSION, key);
    return this.transaction(accountId, async (c) => {
      const observations = await rebuild(c, accountId);
      const now = (
        await c.query<{ now: Date }>('SELECT CURRENT_TIMESTAMP AS now')
      ).rows[0]!.now;
      const previous = await c.query(
        'SELECT 1 FROM issue_dismissals WHERE account_id=$1 AND taxonomy_version=$2 AND issue_key=$3',
        [accountId, ISSUE_TAXONOMY_VERSION, key],
      );
      if (
        !previous.rowCount &&
        !recurringIssues(observations, new Set(), now).some(
          (issue) => issue.issueKey === key,
        )
      )
        throw Error('ISSUE_NOT_FOUND');
      if (dismissed)
        await c.query(
          `INSERT INTO issue_dismissals(account_id,taxonomy_version,issue_key) VALUES($1,$2,$3)
        ON CONFLICT(account_id,taxonomy_version,issue_key) DO UPDATE SET dismissed_at=CASE WHEN issue_dismissals.restored_at IS NULL THEN issue_dismissals.dismissed_at ELSE now() END,restored_at=NULL`,
          [accountId, ISSUE_TAXONOMY_VERSION, key],
        );
      else
        await c.query(
          'UPDATE issue_dismissals SET restored_at=COALESCE(restored_at,now()) WHERE account_id=$1 AND taxonomy_version=$2 AND issue_key=$3',
          [accountId, ISSUE_TAXONOMY_VERSION, key],
        );
    });
  }
}
