import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  AiError,
  ConversationService,
  JobService,
  ReportService,
  type AnalysisJob,
  type ConversationProvider,
} from '@fluentcoach/application';
import {
  PostgresAiBudget,
  PostgresJobStore,
  PostgresReportRepository,
  PostgresSessionRepository,
  sql,
} from '@fluentcoach/infrastructure';
import {
  FakeConversationProvider,
  FakeSessionAnalyzer,
} from '@fluentcoach/testing';
// Required gate: missing PostgreSQL is a failure, never a skipped success.
beforeAll(() => {
  expect(
    process.env['DATABASE_URL'],
    'analysis integration requires an isolated migrated PostgreSQL database',
  ).toBeTruthy();
});
async function setup(
  text = 'I need a room',
  terminalState?: 'ABANDONED' | 'FAILED',
) {
  const account = (
    await sql<{ id: string }>(
      "INSERT INTO accounts(oidc_issuer,oidc_subject)VALUES('synthetic-analysis',$1) RETURNING id",
      [randomUUID()],
    )
  )[0]!.id;
  await sql(
    "INSERT INTO learner_profiles(account_id,interface_language,native_language,timezone,cefr_level,interests)VALUES($1,'es','es','UTC','A1','{}')",
    [account],
  );
  const store = new PostgresJobStore(),
    repo = new PostgresReportRepository(true),
    reports = new ReportService(repo, new FakeSessionAnalyzer()),
    conversation = new ConversationService(
      new PostgresSessionRepository(),
      new FakeConversationProvider(),
      store,
    );
  const session = await conversation.start(account, {
    scenarioSlug: 'hotel',
    level: 'A1',
    mode: 'natural',
  });
  if (text) await conversation.turn(account, session.id, 'learner-turn', text);
  if (terminalState)
    await sql('UPDATE practice_sessions SET state=$2 WHERE id=$1', [
      session.id,
      terminalState,
    ]);
  const result = await store.finalize({
    accountId: account,
    sessionId: session.id,
    hasTurns: !!text,
  });
  const job: AnalysisJob = {
    version: 1,
    analysisRunId: result.run.id,
    accountId: account,
    sessionId: session.id,
    transcriptRevision: result.run.revision,
  };
  const jobs = new JobService(
    store,
    { enqueue: () => Promise.resolve() },
    reports,
  );
  return { account, session, store, repo, reports, job, jobs };
}
describe('automatic analysis, PostgreSQL report persistence and retry', () => {
  it('analyzes late immutable revisions and cites their evidence while preserving the original transcript', async () => {
    const x = await setup(),
      sessions = new PostgresSessionRepository();
    const frozen = await sessions.get(x.account, x.session.id);
    const run = (await x.store.claim(
      x.job,
      new Date(),
      new Date(Date.now() + 30000),
      3,
    ))!;
    const stale = await x.reports.analyze(x.job);
    const turns = [
      {
        sequence: 1,
        sourceEventKey: 'late-learner',
        speaker: 'learner' as const,
        text: 'Updated synthetic learner evidence',
        language: 'en' as const,
      },
    ];
    const revised = await x.jobs.revise({
      accountId: x.account,
      sessionId: x.session.id,
      sourceKey: 'late-content',
      turns,
    });
    await expect(
      x.store.succeed(run, stale.providerRunId, stale),
    ).rejects.toThrow('unauthorized');
    await expect(x.reports.analyze(x.job)).rejects.toThrow('unauthorized');
    expect(await sessions.get(x.account, x.session.id)).toEqual(frozen);
    const job = {
      ...x.job,
      analysisRunId: revised.run.id,
      transcriptRevision: 2,
    };
    expect((await x.repo.transcript(job)).turns).toEqual(turns);
    expect(await x.jobs.execute(job)).toBe('succeeded');
    const view = await new PostgresReportRepository().view(
      x.account,
      x.session.id,
    );
    expect(view).toMatchObject({
      status: 'succeeded',
      revision: 2,
      partial: false,
    });
    expect(view.report?.strengths[0]?.evidence[0]?.quote).toBe(turns[0]!.text);
    expect(
      await x.jobs.revise({
        accountId: x.account,
        sessionId: x.session.id,
        sourceKey: 'late-content',
        turns,
      }),
    ).toMatchObject({
      run: { id: revised.run.id, revision: 2, status: 'succeeded' },
      outboxId: revised.outboxId,
    });
    expect(
      await sql('SELECT * FROM session_reports WHERE session_id=$1', [
        x.session.id,
      ]),
    ).toHaveLength(1);
    expect(
      await sql('SELECT * FROM provider_runs WHERE analysis_run_id=$1', [
        revised.run.id,
      ]),
    ).toHaveLength(1);
  });
  it('reports abandoned and failed sessions from explicit partial snapshots without changing their terminal states', async () => {
    for (const state of ['ABANDONED', 'FAILED'] as const) {
      const x = await setup('I need a room', state);
      expect((await x.repo.transcript(x.job)).partial).toBe(true);
      expect(await x.jobs.execute(x.job)).toBe('succeeded');
      expect(await x.repo.view(x.account, x.session.id)).toMatchObject({
        status: 'succeeded',
        partial: true,
      });
      expect(
        (
          await sql('SELECT state FROM practice_sessions WHERE id=$1', [
            x.session.id,
          ])
        )[0]?.state,
      ).toBe(state);
    }
  });
  it('ends atomically, persists one validated report/audit and survives duplicate delivery and reload', async () => {
    const x = await setup();
    await x.store.markPublished(x.job.analysisRunId);
    expect(await x.jobs.execute(x.job)).toBe('succeeded');
    expect(await x.jobs.execute(x.job)).toBe('duplicate');
    const view = await new PostgresReportRepository().view(
      x.account,
      x.session.id,
    );
    expect(view.status).toBe('succeeded');
    expect(view.report?.strengths[0]?.evidence[0]?.quote).toBe('I need a room');
    expect(
      await sql('SELECT id FROM session_reports WHERE session_id=$1', [
        x.session.id,
      ]),
    ).toHaveLength(1);
    expect(
      await sql('SELECT id FROM provider_runs WHERE analysis_run_id=$1', [
        x.job.analysisRunId,
      ]),
    ).toHaveLength(1);
    expect(
      (
        await x.store.finalize({
          accountId: x.account,
          sessionId: x.session.id,
          hasTurns: true,
        })
      ).run.id,
    ).toBe(x.job.analysisRunId);
  });
  it.each(['malformed', 'fabricated-evidence'] as const)(
    'rejects %s without persisting any partial report, exhausts retries and resets outbox on explicit retry',
    async (scenario) => {
      const x = await setup();
      const jobs = new JobService(
        x.store,
        { enqueue: () => Promise.resolve() },
        new ReportService(x.repo, new FakeSessionAnalyzer(scenario)),
      );
      for (let n = 0; n < 3; n++) {
        await x.store.markPublished(x.job.analysisRunId);
        expect(await jobs.execute(x.job)).toBe('failed');
      }
      const view = await x.reports.view(x.account, x.session.id);
      expect(view.status).toBe('failed');
      expect(view.errorCode).toBe(
        scenario === 'malformed' ? 'invalid-output' : 'invalid-evidence',
      );
      expect(
        await sql('SELECT id FROM session_reports WHERE session_id=$1', [
          x.session.id,
        ]),
      ).toHaveLength(0);
      await x.reports.retry(x.account, x.session.id);
      expect(
        (await x.store.pending()).some(
          (j) => j.analysisRunId === x.job.analysisRunId,
        ),
      ).toBe(true);
      expect(await x.jobs.execute(x.job)).toBe('succeeded');
    },
  );
  it('skips empty sessions without calling an analyzer or inventing feedback', async () => {
    const x = await setup('');
    expect(await x.jobs.execute(x.job)).toBe('duplicate');
    expect(await x.reports.view(x.account, x.session.id)).toMatchObject({
      status: 'skipped',
    });
    expect(
      await sql('SELECT id FROM session_reports WHERE session_id=$1', [
        x.session.id,
      ]),
    ).toHaveLength(0);
  });
  it('scopes transcript, reads, retry and job admission to two accounts; DB rejects cross-account reports', async () => {
    const a = await setup(),
      b = await setup();
    await expect(a.reports.view(b.account, a.session.id)).rejects.toThrow(
      'SESSION_NOT_FOUND',
    );
    await expect(a.reports.retry(b.account, a.session.id)).rejects.toThrow(
      'SESSION_NOT_FOUND',
    );
    await expect(
      a.repo.transcript({ ...a.job, accountId: b.account }),
    ).rejects.toThrow('unauthorized');
    await expect(
      a.jobs.execute({ ...a.job, accountId: b.account }),
    ).rejects.toThrow('JOB_ENVELOPE_MISMATCH');
    expect((await a.reports.view(a.account, a.session.id)).status).toBe(
      'pending',
    );
    await expect(
      sql(
        "INSERT INTO session_reports(analysis_run_id,session_id,account_id,transcript_revision,schema_version,content)VALUES($1,$2,$3,1,'report-v1','{}')",
        [a.job.analysisRunId, a.session.id, b.account],
      ),
    ).rejects.toThrow();
    expect(await a.jobs.execute(a.job)).toBe('succeeded');
  });
  it('rolls back report and audit together after a provider response; a fresh delivery persists one effect', async () => {
    const x = await setup();
    const run = await x.store.claim(
      x.job,
      new Date(),
      new Date(Date.now() + 30000),
      3,
    );
    const response = await x.reports.analyze(x.job);
    await expect(
      x.store.succeed(run!, 'not-a-uuid', response),
    ).rejects.toThrow();
    expect(
      await sql('SELECT id FROM session_reports WHERE session_id=$1', [
        x.session.id,
      ]),
    ).toHaveLength(0);
    expect((await x.reports.view(x.account, x.session.id)).status).toBe(
      'running',
    );
    await x.store.fail(run!, 'unavailable', true);
    expect(await x.jobs.execute(x.job)).toBe('succeeded');
  });
  it('revalidates evidence at persistence rather than trusting a provider wrapper', async () => {
    const x = await setup(),
      run = await x.store.claim(
        x.job,
        new Date(),
        new Date(Date.now() + 30000),
        3,
      ),
      response = await x.reports.analyze(x.job);
    response.report!.strengths[0]!.evidence[0]!.quote = 'fabricated';
    await expect(
      x.store.succeed(run!, response.providerRunId, response),
    ).rejects.toThrow('invalid-evidence');
    expect(
      await sql('SELECT id FROM session_reports WHERE session_id=$1', [
        x.session.id,
      ]),
    ).toHaveLength(0);
  });
  it('fences stale workers after lease recovery and rejects transcript revisions that changed in flight', async () => {
    const x = await setup();
    const old = await x.store.claim(
      x.job,
      new Date(),
      new Date(Date.now() + 30000),
      3,
    );
    const response = await x.reports.analyze(x.job);
    await sql(
      "UPDATE analysis_runs SET lease_until=now()-interval '1 second' WHERE id=$1",
      [old!.id],
    );
    const current = await x.store.claim(
      x.job,
      new Date(),
      new Date(Date.now() + 30000),
      3,
    );
    await expect(
      x.store.succeed(old!, response.providerRunId, response),
    ).rejects.toThrow('cancelled');
    await x.store.fail(old!, 'old-error', false);
    expect((await x.reports.view(x.account, x.session.id)).status).toBe(
      'running',
    );
    await sql(
      'UPDATE practice_sessions SET transcript_revision=transcript_revision+1 WHERE id=$1',
      [x.session.id],
    );
    await expect(
      x.store.succeed(current!, response.providerRunId, response),
    ).rejects.toThrow('unauthorized');
    expect(
      await sql('SELECT id FROM session_reports WHERE session_id=$1', [
        x.session.id,
      ]),
    ).toHaveLength(0);
  });
  it('blocks disabled/deleting accounts during in-flight persistence and cascades reports on deletion', async () => {
    const x = await setup(),
      run = await x.store.claim(
        x.job,
        new Date(),
        new Date(Date.now() + 30000),
        3,
      ),
      response = await x.reports.analyze(x.job);
    await sql("UPDATE accounts SET status='DELETING' WHERE id=$1", [x.account]);
    await expect(
      x.store.succeed(run!, response.providerRunId, response),
    ).rejects.toThrow('unauthorized');
    await sql("UPDATE accounts SET status='ACTIVE' WHERE id=$1", [x.account]);
    await x.store.succeed(run!, response.providerRunId, response);
    await sql('DELETE FROM accounts WHERE id=$1', [x.account]);
    expect(
      await sql('SELECT id FROM session_reports WHERE session_id=$1', [
        x.session.id,
      ]),
    ).toHaveLength(0);
  });
  it('reconciles expired published leases and never admits an exhausted worker', async () => {
    const x = await setup();
    await x.store.claim(x.job, new Date(), new Date(Date.now() + 30000), 3);
    await x.store.markPublished(x.job.analysisRunId);
    await sql(
      "UPDATE analysis_runs SET lease_until=now()-interval '1 second' WHERE id=$1",
      [x.job.analysisRunId],
    );
    expect(
      (await x.store.pending()).some(
        (job) => job.analysisRunId === x.job.analysisRunId,
      ),
    ).toBe(true);
    expect(await x.jobs.execute(x.job)).toBe('succeeded');
  });
  it('reserves free quotas atomically across concurrent processes and conservatively retains unknown usage', async () => {
    const model = `gemini-synthetic-${randomUUID()}`,
      q = {
        dailyRequests: 3,
        dailyTokens: 300,
        maxInputTokens: 100,
        maxOutputTokens: 20,
        verifiedUntil: new Date('2099-01-01'),
      };
    const stores = [
      new PostgresAiBudget(q, model),
      new PostgresAiBudget(q, model),
    ];
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) => stores[i % 2]!.reserve(100)),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    for (const result of results)
      if (result.status === 'fulfilled')
        await stores[0]!.settle(result.value, null, null);
    expect(
      (
        await sql<{ requests: number; tokens: number }>(
          'SELECT requests,tokens FROM ai_daily_budgets WHERE model=$1',
          [model],
        )
      )[0],
    ).toMatchObject({ requests: 3, tokens: 300 });
    await expect(new PostgresAiBudget(q, model).available()).rejects.toThrow(
      'budget-exhausted',
    );
    await expect(stores[0]!.reserve(100)).rejects.toBeInstanceOf(AiError);
  });
  it('blocks known exhausted provider quota and expired verification before new sessions/calls', async () => {
    const model = `gemini-synthetic-${randomUUID()}`,
      q = {
        dailyRequests: 3,
        dailyTokens: 3000,
        maxInputTokens: 100,
        maxOutputTokens: 20,
        verifiedUntil: new Date('2099-01-01'),
      },
      budget = new PostgresAiBudget(q, model);
    await budget.block();
    await expect(budget.available()).rejects.toThrow('budget-exhausted');
    await expect(budget.reserve(100)).rejects.toThrow('budget-exhausted');
    await expect(
      new PostgresAiBudget({ ...q, verifiedUntil: new Date(0) }, model).reserve(
        100,
      ),
    ).rejects.toThrow('budget-exhausted');
  });
  it('serializes turns across API instances and rejects late provider responses after end', async () => {
    const x = await setup(),
      repo = new PostgresSessionRepository();
    const session = await repo.create(x.account, x.session.snapshot);
    let release = () => undefined as void;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    const provider: ConversationProvider = {
      stream: () => ({
        async *[Symbol.asyncIterator]() {
          await wait;
          yield { text: 'late response', done: true };
        },
      }),
    };
    const a = new ConversationService(repo, provider, x.store),
      b = new ConversationService(
        new PostgresSessionRepository(),
        new FakeConversationProvider(),
        x.store,
      );
    const pending = a.turn(x.account, session.id, 'one', 'Hello');
    const rejection = expect(pending).rejects.toBeInstanceOf(AiError);
    while ((await repo.get(x.account, session.id))?.turns.length !== 1)
      await new Promise((resolve) => setTimeout(resolve, 5));
    await expect(
      b.turn(x.account, session.id, 'two', 'Concurrent'),
    ).rejects.toThrow('unavailable');
    await a.end(x.account, session.id);
    release();
    await rejection;
    const final = await repo.get(x.account, session.id);
    expect(final?.state).toBe('ended');
    expect(final?.turns.filter((t) => t.speaker === 'learner')).toHaveLength(1);
    expect(final?.turns.some((t) => t.text === 'late response')).toBe(false);
  });
});
