import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  ConversationService,
  JobService,
  ReportService,
  type ReportDraft,
} from '@fluentcoach/application';
import {
  PostgresIssueRepository,
  PostgresJobStore,
  PostgresReportRepository,
  PostgresSessionRepository,
  sql,
} from '@fluentcoach/infrastructure';
import {
  FakeConversationProvider,
  FakeSessionAnalyzer,
} from '@fluentcoach/testing';
import { account, envelope } from '../support/database.js';
const issues = new PostgresIssueRepository();
beforeAll(() =>
  expect(
    process.env['DATABASE_URL'],
    'issues gate requires a real migrated PostgreSQL database',
  ).toBeTruthy(),
);
async function practice(accountId: string, count = 2) {
  const store = new PostgresJobStore();
  const conversation = new ConversationService(
    new PostgresSessionRepository(),
    new FakeConversationProvider(),
    store,
  );
  const session = await conversation.start(accountId, {
    scenarioSlug: 'hotel',
    level: 'A1',
    mode: 'natural',
  });
  for (let index = 0; index < count; index++)
    await conversation.turn(
      accountId,
      session.id,
      `turn-${index}`,
      `Yesterday I go to hotel ${index}`,
    );
  const finalized = await store.finalize({
    accountId,
    sessionId: session.id,
    hasTurns: count > 0,
  });
  const jobs = new JobService(
    store,
    { enqueue: () => Promise.resolve() },
    new ReportService(
      new PostgresReportRepository(true),
      new FakeSessionAnalyzer(),
    ),
  );
  return { store, jobs, session, job: envelope(finalized.run) };
}
async function recurring() {
  const owner = await account(`issues-${randomUUID()}`);
  const a = await practice(owner.id),
    b = await practice(owner.id, 1);
  await a.jobs.execute(a.job);
  await b.jobs.execute(b.job);
  return { owner, a, b };
}
describe('current-report issue persistence and lifecycle', () => {
  it('persists canonical observations with report commit and shows only threshold-qualified exact evidence', async () => {
    const owner = await account(`threshold-${randomUUID()}`),
      a = await practice(owner.id, 3);
    expect(await a.jobs.execute(a.job)).toBe('succeeded');
    expect(
      await sql('SELECT * FROM issue_observations WHERE account_id=$1', [
        owner.id,
      ]),
    ).toHaveLength(3);
    expect(await issues.list(owner.id)).toEqual([]);
    const b = await practice(owner.id, 1);
    await b.jobs.execute(b.job);
    const result = await issues.list(owner.id);
    expect(result[0]).toMatchObject({
      observationCount: 4,
      sessionCount: 2,
      dismissed: false,
    });
    for (const observation of result[0]!.evidence) {
      const row = (
        await sql<{ content: ReportDraft }>(
          'SELECT content FROM session_reports WHERE id=$1 AND account_id=$2',
          [observation.reportId, owner.id],
        )
      )[0]!;
      expect(
        row.content.corrections.flatMap((finding) => finding.evidence),
      ).toContainEqual(observation.evidence);
    }
    expect(
      await sql(
        'SELECT * FROM recurring_issue_aggregates WHERE account_id=$1',
        [owner.id],
      ),
    ).toMatchObject([{ observation_count: 4, session_count: 2 }]);
  });
  it('handles concurrent delivery, duplicate success, repeated rebuilds and missing materialization without duplication', async () => {
    const owner = await account(`concurrent-${randomUUID()}`),
      a = await practice(owner.id);
    expect(
      (
        await Promise.all([a.jobs.execute(a.job), a.jobs.execute(a.job)])
      ).sort(),
    ).toEqual(['duplicate', 'succeeded']);
    const b = await practice(owner.id, 1);
    await b.jobs.execute(b.job);
    const first = await issues.list(owner.id);
    expect(
      await Promise.all([issues.list(owner.id), issues.list(owner.id)]),
    ).toEqual([first, first]);
    expect(await a.jobs.execute(a.job)).toBe('duplicate');
    await sql('DELETE FROM issue_observations WHERE account_id=$1', [owner.id]);
    expect(await issues.list(owner.id)).toEqual(first);
    expect(
      await sql('SELECT * FROM issue_observations WHERE account_id=$1', [
        owner.id,
      ]),
    ).toHaveLength(3);
  });
  it('supersedes observations immediately; replacement and repeat revision do not count as new sessions', async () => {
    const { owner, a } = await recurring();
    const changed = await a.jobs.revise({
      accountId: owner.id,
      sessionId: a.session.id,
      sourceKey: 'replace',
      turns: [
        {
          sequence: 1,
          sourceEventKey: 'replacement',
          speaker: 'learner',
          language: 'en',
          text: 'Yesterday I go elsewhere',
        },
      ],
    });
    expect(await issues.list(owner.id)).toEqual([]); // old report cannot contribute while replacement is pending
    const replacement = envelope(changed.run);
    expect(await a.jobs.execute(replacement)).toBe('succeeded');
    expect(await issues.list(owner.id)).toEqual([]); // two observations / two sessions
    expect(await a.jobs.execute(replacement)).toBe('duplicate');
    expect(
      await sql('SELECT * FROM issue_observations WHERE account_id=$1', [
        owner.id,
      ]),
    ).toHaveLength(2);
    const third = await practice(owner.id, 1);
    await third.jobs.execute(third.job);
    const result = (await issues.list(owner.id))[0]!;
    expect(result).toMatchObject({ observationCount: 3, sessionCount: 3 });
    expect(
      result.evidence.filter((item) => item.sessionId === a.session.id),
    ).toMatchObject([{ revision: 2, analysisRunId: changed.run.id }]);
  });
  it('serializes rebuilds with concurrent report delivery and dismissal', async () => {
    const owner = await account(`rebuild-delivery-${randomUUID()}`);
    const a = await practice(owner.id),
      b = await practice(owner.id, 1);
    await a.jobs.execute(a.job);
    const [delivery] = await Promise.all([
      b.jobs.execute(b.job),
      issues.list(owner.id),
      issues.list(owner.id),
    ]);
    expect(delivery).toBe('succeeded');
    expect((await issues.list(owner.id))[0]).toMatchObject({
      observationCount: 3,
      sessionCount: 2,
    });
    await Promise.all([
      issues.setDismissed(owner.id, 'verb-tense', true),
      issues.list(owner.id),
    ]);
    expect((await issues.list(owner.id))[0]?.dismissed).toBe(true);
  });
  it('preserves existing analysis-v2 finalization and equivalent-revision receipts after upgrade', async () => {
    const owner = await account(`legacy-run-${randomUUID()}`),
      a = await practice(owner.id);
    await sql(
      "UPDATE analysis_runs SET analyzer_version='analysis-v2' WHERE id=$1 AND account_id=$2",
      [a.job.analysisRunId, owner.id],
    );
    const receipt = await a.store.finalize({
      accountId: owner.id,
      sessionId: a.session.id,
      hasTurns: true,
    });
    expect(receipt.run.id).toBe(a.job.analysisRunId);
    expect(await a.jobs.execute(a.job)).toBe('succeeded');
    const transcript = await new PostgresReportRepository().transcript(a.job);
    expect(
      (
        await a.jobs.revise({
          accountId: owner.id,
          sessionId: a.session.id,
          sourceKey: 'equivalent-legacy',
          turns: [...transcript.turns],
        })
      ).run.id,
    ).toBe(a.job.analysisRunId);
  });
  it('does not refresh the 30-day practice window on reanalysis', async () => {
    const { owner, a } = await recurring();
    await sql(
      "UPDATE practice_sessions SET ended_at=now()-interval '31 days' WHERE id=$1 AND account_id=$2",
      [a.session.id, owner.id],
    );
    expect(await issues.list(owner.id)).toEqual([]);
    const revision = await a.jobs.revise({
      accountId: owner.id,
      sessionId: a.session.id,
      sourceKey: 'old-reanalysis',
      turns: [1, 2, 3].map((sequence) => ({
        sequence,
        sourceEventKey: `new-${sequence}`,
        speaker: 'learner' as const,
        language: 'en' as const,
        text: `Yesterday I go old ${sequence}`,
      })),
    });
    await a.jobs.execute(envelope(revision.run));
    expect(await issues.list(owner.id)).toEqual([]);
  });
  it('keeps account dismissal auditable across rebuilds, new evidence, disappearance and explicit restore', async () => {
    const { owner, a } = await recurring();
    await issues.setDismissed(owner.id, 'verb-tense', true);
    const stamp = (
      await sql(
        'SELECT dismissed_at FROM issue_dismissals WHERE account_id=$1',
        [owner.id],
      )
    )[0];
    await issues.setDismissed(owner.id, 'verb-tense', true);
    expect(
      (
        await sql(
          'SELECT dismissed_at FROM issue_dismissals WHERE account_id=$1',
          [owner.id],
        )
      )[0],
    ).toEqual(stamp);
    const c = await practice(owner.id, 1);
    await c.jobs.execute(c.job);
    expect((await issues.list(owner.id))[0]).toMatchObject({
      observationCount: 4,
      dismissed: true,
    });
    await sql('DELETE FROM practice_sessions WHERE id=$1 AND account_id=$2', [
      a.session.id,
      owner.id,
    ]);
    expect(await issues.list(owner.id)).toEqual([]);
    const d = await practice(owner.id, 1);
    await d.jobs.execute(d.job);
    expect((await issues.list(owner.id))[0]?.dismissed).toBe(true);
    await issues.setDismissed(owner.id, 'verb-tense', false);
    expect((await issues.list(owner.id))[0]?.dismissed).toBe(false);
    expect(
      (
        await sql(
          'SELECT restored_at FROM issue_dismissals WHERE account_id=$1',
          [owner.id],
        )
      )[0]?.restored_at,
    ).toBeTruthy();
  });
  it.each([
    'session',
    'report',
    'transcript',
    'invalid-evidence',
    'help-turns',
    'empty-report',
    'failed-analysis',
  ] as const)(
    'rebuilds after %s source removal/invalidation',
    async (source) => {
      const { owner, a } = await recurring();
      const table = {
        session: 'practice_sessions',
        report: 'session_reports',
        transcript: 'transcript_revisions',
      };
      if (source === 'help-turns')
        await sql(
          `UPDATE transcript_revisions SET turns=jsonb_set(turns,'{0,speaker}','"help"') WHERE account_id=$1 AND session_id=$2`,
          [owner.id, a.session.id],
        );
      else if (source === 'empty-report')
        await sql(
          `UPDATE session_reports SET content=jsonb_set(jsonb_set(content,'{corrections}','[]'),'{strengths}','[]') WHERE account_id=$1 AND session_id=$2`,
          [owner.id, a.session.id],
        );
      else if (source === 'failed-analysis')
        await sql(
          "UPDATE analysis_runs SET status='FAILED' WHERE account_id=$1 AND session_id=$2",
          [owner.id, a.session.id],
        );
      else if (source === 'invalid-evidence')
        await sql(
          `UPDATE session_reports SET content=jsonb_set(content,'{corrections,0,evidence,0,quote}','"invented"') WHERE account_id=$1 AND session_id=$2`,
          [owner.id, a.session.id],
        );
      else
        await sql(
          `DELETE FROM ${table[source]} WHERE account_id=$1 AND ${source === 'session' ? 'id' : 'session_id'}=$2`,
          [owner.id, a.session.id],
        );
      expect(await issues.list(owner.id)).toEqual([]);
      expect(
        await sql(
          'SELECT * FROM issue_observations WHERE account_id=$1 AND session_id=$2',
          [owner.id, a.session.id],
        ),
      ).toHaveLength(0);
    },
  );
  it('rolls back observations with report/audit failure, then retries one effect', async () => {
    const owner = await account(`rollback-${randomUUID()}`),
      a = await practice(owner.id);
    const claimed = (await a.store.claim(
      a.job,
      new Date(),
      new Date(Date.now() + 30000),
      3,
    ))!;
    const response = await new ReportService(
      new PostgresReportRepository(true),
      new FakeSessionAnalyzer(),
    ).analyze(a.job);
    await expect(
      a.store.succeed(claimed, 'invalid-uuid', response),
    ).rejects.toThrow();
    expect(
      await sql('SELECT * FROM issue_observations WHERE account_id=$1', [
        owner.id,
      ]),
    ).toEqual([]);
    await a.store.fail(claimed, 'unavailable', true);
    expect(await a.jobs.execute(a.job)).toBe('succeeded');
    expect(
      await sql('SELECT * FROM issue_observations WHERE account_id=$1', [
        owner.id,
      ]),
    ).toHaveLength(2);
  });
  it('creates no observations for empty, failed, help-only or fabricated reports', async () => {
    const owner = await account(`invalid-${randomUUID()}`),
      empty = await practice(owner.id, 0);
    expect(await empty.jobs.execute(empty.job)).toBe('duplicate');
    for (const scenario of ['malformed', 'fabricated-evidence'] as const) {
      const a = await practice(owner.id);
      const jobs = new JobService(
        a.store,
        { enqueue: () => Promise.resolve() },
        new ReportService(
          new PostgresReportRepository(true),
          new FakeSessionAnalyzer(scenario),
        ),
      );
      expect(await jobs.execute(a.job)).toBe('failed');
    }
    expect(await issues.list(owner.id)).toEqual([]);
    expect(
      await sql('SELECT * FROM issue_observations WHERE account_id=$1', [
        owner.id,
      ]),
    ).toEqual([]);
  });
  it('rejects cross-account source constraints and removes all issue data with account deletion', async () => {
    const { owner } = await recurring(),
      other = await account(`foreign-${randomUUID()}`);
    await expect(
      sql('UPDATE issue_observations SET account_id=$2 WHERE account_id=$1', [
        owner.id,
        other.id,
      ]),
    ).rejects.toThrow();
    await issues.setDismissed(owner.id, 'verb-tense', true);
    await sql('DELETE FROM accounts WHERE id=$1', [owner.id]);
    expect(
      await sql('SELECT * FROM issue_observations WHERE account_id=$1', [
        owner.id,
      ]),
    ).toEqual([]);
    expect(
      await sql('SELECT * FROM issue_dismissals WHERE account_id=$1', [
        owner.id,
      ]),
    ).toEqual([]);
  });
});
