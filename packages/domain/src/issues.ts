/** Application-owned, deliberately small taxonomy. Changing aliases requires a new version. */
export const ISSUE_TAXONOMY_VERSION = 'language-issues-v1' as const;
export const ISSUE_TAXONOMY = [
  {
    key: 'verb-tense',
    label: 'Tiempos verbales',
    category: 'grammar',
    aliases: [
      'verb tense',
      'past tense',
      'present tense',
      'future tense',
      'tiempos verbales',
      'tiempo verbal',
    ],
  },
  {
    key: 'subject-verb-agreement',
    label: 'Concordancia sujeto-verbo',
    category: 'grammar',
    aliases: [
      'subject-verb agreement',
      'subject/verb agreement',
      'concordancia sujeto-verbo',
      'concordancia entre sujeto y verbo',
    ],
  },
  {
    key: 'articles',
    label: 'Artículos',
    category: 'grammar',
    aliases: ['articles', 'artículos'],
  },
  {
    key: 'prepositions',
    label: 'Preposiciones',
    category: 'grammar',
    aliases: ['prepositions', 'preposiciones'],
  },
  {
    key: 'word-order',
    label: 'Orden de palabras',
    category: 'grammar',
    aliases: ['word order', 'orden de palabras'],
  },
  {
    key: 'vocabulary-choice',
    label: 'Elección de vocabulario',
    category: 'vocabulary',
    aliases: [
      'vocabulary choice',
      'word choice',
      'elección de vocabulario',
      'elección de palabras',
    ],
  },
  {
    key: 'singular-plural',
    label: 'Singular y plural',
    category: 'grammar',
    aliases: ['singular/plural', 'singular and plural', 'singular y plural'],
  },
  {
    key: 'auxiliary-verbs',
    label: 'Verbos auxiliares',
    category: 'grammar',
    aliases: ['auxiliary verbs', 'verbos auxiliares'],
  },
] as const;
export type IssueKey = (typeof ISSUE_TAXONOMY)[number]['key'];
export function taxonomyIssue(version: string, key: string) {
  if (version !== ISSUE_TAXONOMY_VERSION) throw Error('INVALID_ISSUE_TAXONOMY');
  const issue = ISSUE_TAXONOMY.find((item) => item.key === key);
  if (!issue) throw Error('INVALID_ISSUE_TAXONOMY');
  return issue;
}
/** Only explicit correction headings; unknown or ambiguous headings produce no observation. */
export function classifyIssue(heading: string): IssueKey | null {
  const text = heading.trim().toLocaleLowerCase('en');
  const matches = ISSUE_TAXONOMY.filter((issue) =>
    [issue.key, ...issue.aliases].some(
      (alias) =>
        text === alias ||
        [':', ' —', ' -', '.'].some((separator) =>
          text.startsWith(alias + separator),
        ),
    ),
  );
  return matches.length === 1 ? matches[0]!.key : null;
}
export const RECURRENCE = {
  observations: 3,
  sessions: 2,
  windowDays: 30,
} as const;
export interface IssueObservation {
  taxonomyVersion: string;
  issueKey: IssueKey;
  label: string;
  category: string;
  sessionId: string;
  reportId: string;
  analysisRunId: string;
  revision: number;
  occurredAt: string;
  uncertainty: 'low' | 'medium' | 'high';
  evidence: { turnSequence: number; start: number; end: number; quote: string };
}
export interface RecurringIssue {
  taxonomyVersion: string;
  issueKey: IssueKey;
  label: string;
  category: string;
  observationCount: number;
  sessionCount: number;
  firstOccurredAt: string;
  lastOccurredAt: string;
  dismissed: boolean;
  evidence: IssueObservation[];
}
/** Input must already be current validated observations. Deduplication also prevents quote slicing inflation. */
export function recurringIssues(
  observations: readonly IssueObservation[],
  dismissedKeys: ReadonlySet<string>,
  now: Date,
): RecurringIssue[] {
  const cutoff = now.getTime() - RECURRENCE.windowDays * 86400000;
  const groups = new Map<IssueKey, Map<string, IssueObservation>>();
  const sorted = [...observations].sort((a, b) =>
    JSON.stringify(a).localeCompare(JSON.stringify(b), 'en'),
  );
  for (const observation of sorted) {
    taxonomyIssue(observation.taxonomyVersion, observation.issueKey);
    const time = Date.parse(observation.occurredAt);
    if (time < cutoff || time > now.getTime() || !Number.isFinite(time))
      continue;
    const group =
      groups.get(observation.issueKey) ?? new Map<string, IssueObservation>();
    group.set(
      `${observation.sessionId}:${observation.evidence.turnSequence}`,
      observation,
    );
    groups.set(observation.issueKey, group);
  }
  return ISSUE_TAXONOMY.flatMap((issue) => {
    const evidence = [...(groups.get(issue.key)?.values() ?? [])].sort(
      (a, b) =>
        a.occurredAt.localeCompare(b.occurredAt) ||
        a.sessionId.localeCompare(b.sessionId) ||
        a.evidence.turnSequence - b.evidence.turnSequence,
    );
    const sessionCount = new Set(evidence.map((item) => item.sessionId)).size;
    if (
      evidence.length < RECURRENCE.observations ||
      sessionCount < RECURRENCE.sessions
    )
      return [];
    return [
      {
        taxonomyVersion: ISSUE_TAXONOMY_VERSION,
        issueKey: issue.key,
        label: issue.label,
        category: issue.category,
        observationCount: evidence.length,
        sessionCount,
        firstOccurredAt: evidence[0]!.occurredAt,
        lastOccurredAt: evidence[evidence.length - 1]!.occurredAt,
        dismissed: dismissedKeys.has(issue.key),
        evidence,
      },
    ];
  });
}
