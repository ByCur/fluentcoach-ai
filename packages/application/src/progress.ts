import type { progressMetrics, RecurringIssue } from '@fluentcoach/domain';
export type IssueTrend = {
  issueKey: string;
  label: string;
  observationCount: number;
  sessionCount: number;
  buckets: {
    startsAt: string;
    endsAt: string;
    observations: number;
    sessions: number;
  }[];
  evidence: RecurringIssue['evidence'];
  message: string;
};
export interface ProgressRepository {
  get(accountId: string): Promise<ReturnType<typeof progressMetrics>>;
  issues(accountId: string): Promise<IssueTrend[]>;
}
export class ProgressService {
  constructor(private readonly repo: ProgressRepository) {}
  get(accountId: string) {
    return this.repo.get(accountId);
  }
  issues(accountId: string) {
    return this.repo.issues(accountId);
  }
}
