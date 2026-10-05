import { describe, expect, it } from 'vitest';
import {
  classifyIssue,
  ISSUE_TAXONOMY,
  ISSUE_TAXONOMY_VERSION,
  recurringIssues,
  taxonomyIssue,
  type IssueObservation,
} from './issues.js';
const now = new Date('2026-10-05T12:00:00.000Z');
function observation(
  sessionId: string,
  turnSequence: number,
  occurredAt = now.toISOString(),
): IssueObservation {
  return {
    taxonomyVersion: ISSUE_TAXONOMY_VERSION,
    issueKey: 'verb-tense',
    label: 'Tiempos verbales',
    category: 'grammar',
    sessionId,
    reportId: `report-${sessionId}`,
    analysisRunId: `run-${sessionId}`,
    revision: 1,
    occurredAt,
    uncertainty: 'low',
    evidence: { turnSequence, start: 0, end: 4, quote: 'I go' },
  };
}
const three = [observation('a', 1), observation('a', 3), observation('b', 1)];
describe('versioned language issue taxonomy and recurrence', () => {
  it('has eight unique stable keys and validates version/key pairs', () => {
    expect(ISSUE_TAXONOMY).toHaveLength(8);
    expect(new Set(ISSUE_TAXONOMY.map((issue) => issue.key)).size).toBe(8);
    expect(taxonomyIssue(ISSUE_TAXONOMY_VERSION, 'verb-tense').category).toBe(
      'grammar',
    );
    expect(() => taxonomyIssue('language-issues-v2', 'verb-tense')).toThrow(
      'INVALID_ISSUE_TAXONOMY',
    );
    expect(() => taxonomyIssue(ISSUE_TAXONOMY_VERSION, 'personality')).toThrow(
      'INVALID_ISSUE_TAXONOMY',
    );
  });
  it('maps explicit bilingual correction headings conservatively', () => {
    expect(classifyIssue('Past tense: use went')).toBe('verb-tense');
    expect(classifyIssue('Artículos — usa an')).toBe('articles');
    expect(classifyIssue('Has comunicado tu intención.')).toBeNull();
    expect(classifyIssue('You seem anxious about past tense')).toBeNull();
    expect(classifyIssue('Articles and prepositions')).toBeNull();
  });
  it('requires three observations', () =>
    expect(recurringIssues(three.slice(0, 2), new Set(), now)).toEqual([]));
  it('does not recur with three observations from one session', () =>
    expect(
      recurringIssues(
        [1, 3, 5].map((turn) => observation('a', turn)),
        new Set(),
        now,
      ),
    ).toEqual([]));
  it('recurs with three observations across two sessions', () =>
    expect(recurringIssues(three, new Set(), now)[0]).toMatchObject({
      observationCount: 3,
      sessionCount: 2,
      dismissed: false,
    }));
  it('excludes observations older than 30 days and future observations', () => {
    for (const date of ['2026-09-05T11:59:59.999Z', '2026-10-05T12:00:00.001Z'])
      expect(
        recurringIssues(
          [...three.slice(0, 2), observation('b', 1, date)],
          new Set(),
          now,
        ),
      ).toEqual([]);
    expect(
      recurringIssues(
        [...three.slice(0, 2), observation('b', 1, '2026-09-05T12:00:00.000Z')],
        new Set(),
        now,
      ),
    ).toHaveLength(1);
  });
  it('deduplicates repeated findings and sliced excerpts of the same learner turn', () => {
    expect(
      recurringIssues(
        [
          ...three,
          three[0]!,
          {
            ...three[0]!,
            evidence: { turnSequence: 1, start: 1, end: 4, quote: ' go' },
          },
        ],
        new Set(),
        now,
      )[0]?.observationCount,
    ).toBe(3);
  });
  it('is deterministic and idempotent for reordered input', () =>
    expect(recurringIssues([...three].reverse(), new Set(), now)).toEqual(
      recurringIssues(three, new Set(), now),
    ));
  it('keeps dismissal with new evidence until explicit restoration', () => {
    const input = [...three, observation('c', 1)];
    expect(
      recurringIssues(input, new Set(['verb-tense']), now)[0]?.dismissed,
    ).toBe(true);
    expect(recurringIssues(input, new Set(), now)[0]?.dismissed).toBe(false);
  });
});
