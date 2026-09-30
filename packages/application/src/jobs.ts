import { AiError, type ReportResult } from './ai.js';
import type { ConversationTurn } from '@fluentcoach/domain';
export const JOB_ENVELOPE_VERSION = 1 as const;
export interface AnalysisJob {
  version: 1;
  analysisRunId: string;
  accountId: string;
  sessionId: string;
  transcriptRevision: number;
}
export interface AnalysisRun {
  id: string;
  accountId: string;
  sessionId: string;
  revision: number;
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped';
  attempts: number;
  leaseUntil?: Date;
  leaseToken?: string;
  errorCode?: string;
}
export interface TranscriptRevisionInput {
  accountId: string;
  sessionId: string;
  sourceKey: string;
  turns: ConversationTurn[];
}
export interface JobStore {
  finalize(input: {
    accountId: string;
    sessionId: string;
    hasTurns: boolean;
  }): Promise<{ run: AnalysisRun; outboxId: string }>;
  revise(
    input: TranscriptRevisionInput,
  ): Promise<{ run: AnalysisRun; outboxId: string }>;
  claim(
    job: AnalysisJob,
    now: Date,
    leaseUntil: Date,
    maxAttempts: number,
  ): Promise<AnalysisRun | null>;
  succeed(
    run: AnalysisRun,
    providerRunId: string,
    result?: ReportResult,
  ): Promise<void>;
  fail(run: AnalysisRun, errorCode: string, retry: boolean): Promise<void>;
  pending(): Promise<AnalysisJob[]>;
  markPublished?(runId: string): Promise<void>;
}
export interface JobTransport {
  enqueue(job: AnalysisJob): Promise<void>;
}
export interface AnalysisProvider {
  analyze(job: AnalysisJob): Promise<ReportResult>;
}
export class JobService {
  constructor(
    private store: JobStore,
    private transport: JobTransport,
    private provider: AnalysisProvider,
    private maxAttempts = 3,
  ) {}
  finalize(accountId: string, sessionId: string, hasTurns: boolean) {
    return this.store.finalize({ accountId, sessionId, hasTurns });
  }
  revise(input: TranscriptRevisionInput) {
    return this.store.revise(input);
  }
  async dispatch() {
    let unavailable = false;
    for (const job of await this.store.pending()) {
      try {
        await this.transport.enqueue(job);
        await this.store.markPublished?.(job.analysisRunId);
      } catch {
        unavailable = true;
      }
    }
    if (unavailable) throw new Error('JOB_DISPATCH_UNAVAILABLE');
  }
  async execute(job: AnalysisJob, now = new Date()) {
    if (job.version !== JOB_ENVELOPE_VERSION)
      throw new Error('UNSUPPORTED_JOB_VERSION');
    const run = await this.store.claim(
      job,
      now,
      new Date(now.getTime() + 30_000),
      this.maxAttempts,
    );
    if (!run) return 'duplicate';
    try {
      const result = await this.provider.analyze(job);
      await this.store.succeed(run, result.providerRunId, result);
      return 'succeeded';
    } catch (error) {
      // Fixed codes only: provider exception names/messages can contain learner data.
      await this.store.fail(
        run,
        error instanceof AiError ? error.code : 'ANALYSIS_ATTEMPT_FAILED',
        run.attempts < this.maxAttempts,
      );
      return 'failed';
    }
  }
  async reconcile() {
    await this.dispatch();
  }
}
