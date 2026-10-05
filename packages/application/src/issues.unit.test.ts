import { expect, it } from 'vitest';
import { reportObservations } from './issues.js';
import type { AnalysisTranscript, ReportDraft } from './ai.js';
const transcript: AnalysisTranscript = {
  accountId: 'a',
  sessionId: 's',
  revision: 1,
  snapshot: {
    scenarioSlug: 'hotel',
    scenarioVersion: 1,
    level: 'A1',
    mode: 'natural',
    promptVersion: 'tutor-v4',
  },
  partial: false,
  synthetic: true,
  turns: [
    {
      sequence: 1,
      sourceEventKey: 'a',
      speaker: 'learner',
      text: 'Yesterday I go',
      language: 'en',
    },
    {
      sequence: 2,
      sourceEventKey: 'b',
      speaker: 'help',
      text: 'Help please',
      language: 'es',
    },
  ],
};
const source = {
  reportId: 'r',
  analysisRunId: 'run',
  occurredAt: '2026-10-05T12:00:00.000Z',
};
function report(): ReportDraft {
  return {
    schemaVersion: 'report-v1',
    rubricVersion: 'pilot-text-v1',
    strengths: [],
    corrections: [
      {
        text: 'Past tense: use went',
        explanation: 'A past event',
        practice: 'Use went',
        uncertainty: 'low',
        evidence: [
          { turnSequence: 1, start: 0, end: 14, quote: 'Yesterday I go' },
        ],
      },
    ],
  };
}
it('records exact validated evidence and source identity, deduplicating repeated findings', () => {
  const draft = report();
  draft.corrections.push(draft.corrections[0]!);
  expect(reportObservations(draft, transcript, source)).toEqual([
    {
      taxonomyVersion: 'language-issues-v1',
      issueKey: 'verb-tense',
      label: 'Tiempos verbales',
      category: 'grammar',
      sessionId: 's',
      reportId: 'r',
      analysisRunId: 'run',
      revision: 1,
      occurredAt: source.occurredAt,
      uncertainty: 'low',
      evidence: draft.corrections[0]!.evidence[0],
    },
  ]);
});
it('never uses strengths or unclassified corrections', () => {
  const draft = report();
  draft.strengths = draft.corrections;
  draft.corrections = [];
  expect(reportObservations(draft, transcript, source)).toEqual([]);
  draft.corrections = [
    { ...draft.strengths[0]!, text: 'Try a longer sentence' },
  ];
  expect(reportObservations(draft, transcript, source)).toEqual([]);
});
it.each(['No entiendo', "I don't understand", 'help', 'fabricated'])(
  'rejects %s as issue evidence',
  (text) => {
    const draft = report();
    if (text === 'help')
      draft.corrections[0]!.evidence = [
        { turnSequence: 2, start: 0, end: 11, quote: 'Help please' },
      ];
    else if (text === 'fabricated')
      draft.corrections[0]!.evidence[0]!.quote = 'Invented';
    else {
      const changed = {
        ...transcript,
        turns: [{ ...transcript.turns[0]!, text }],
      };
      draft.corrections[0]!.evidence = [
        { turnSequence: 1, start: 0, end: text.length, quote: text },
      ];
      expect(() => reportObservations(draft, changed, source)).toThrow(
        'invalid-evidence',
      );
      return;
    }
    expect(() => reportObservations(draft, transcript, source)).toThrow(
      'invalid-evidence',
    );
  },
);
