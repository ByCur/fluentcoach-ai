import {
  classifyIssue,
  ISSUE_TAXONOMY_VERSION,
  taxonomyIssue,
  type IssueObservation,
  type RecurringIssue,
} from '@fluentcoach/domain';
import { validateReport, type AnalysisTranscript } from './ai.js';
export function reportObservations(
  raw: unknown,
  transcript: AnalysisTranscript,
  source: {
    reportId: string;
    analysisRunId: string;
    occurredAt: string;
  },
): IssueObservation[] {
  const report = validateReport(raw, transcript);
  const observations = new Map<string, IssueObservation>();
  for (const finding of report.corrections) {
    const key = classifyIssue(finding.text);
    if (!key) continue;
    const issue = taxonomyIssue(ISSUE_TAXONOMY_VERSION, key);
    for (const evidence of finding.evidence) {
      const identity = `${key}:${evidence.turnSequence}`;
      // One observation per issue/learner turn, regardless of repeated findings or overlapping excerpts.
      if (observations.has(identity)) continue;
      observations.set(identity, {
        taxonomyVersion: ISSUE_TAXONOMY_VERSION,
        issueKey: key,
        label: issue.label,
        category: issue.category,
        sessionId: transcript.sessionId,
        reportId: source.reportId,
        analysisRunId: source.analysisRunId,
        revision: transcript.revision,
        occurredAt: source.occurredAt,
        uncertainty: finding.uncertainty,
        evidence: { ...evidence },
      });
    }
  }
  return [...observations.values()].sort(
    (a, b) =>
      a.issueKey.localeCompare(b.issueKey) ||
      a.evidence.turnSequence - b.evidence.turnSequence,
  );
}
export interface IssueRepository {
  list(accountId: string): Promise<RecurringIssue[]>;
  setDismissed(
    accountId: string,
    issueKey: string,
    dismissed: boolean,
  ): Promise<void>;
}
export class IssueService {
  constructor(private readonly repository: IssueRepository) {}
  list(accountId: string) {
    return this.repository.list(accountId);
  }
  dismiss(accountId: string, key: string) {
    taxonomyIssue(ISSUE_TAXONOMY_VERSION, key);
    return this.repository.setDismissed(accountId, key, true);
  }
  restore(accountId: string, key: string) {
    taxonomyIssue(ISSUE_TAXONOMY_VERSION, key);
    return this.repository.setDismissed(accountId, key, false);
  }
  async evidence(accountId: string, key: string) {
    const issue = (await this.repository.list(accountId)).find(
      (item) => item.issueKey === key,
    );
    if (!issue) throw Error('ISSUE_NOT_FOUND');
    return issue.evidence;
  }
}
