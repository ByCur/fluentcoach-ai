import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AiError,
  beforeDeadline,
  validateReport,
  type AnalysisTranscript,
} from './ai.js';
const transcript: AnalysisTranscript = {
  accountId: 'a',
  sessionId: 's',
  revision: 1,
  snapshot: {
    scenarioSlug: 'hotel',
    scenarioVersion: 1,
    level: 'A1',
    mode: 'natural',
    promptVersion: 'tutor-v2',
  },
  turns: [
    {
      sequence: 1,
      sourceEventKey: 'l',
      speaker: 'learner',
      text: 'I need a room 🏨',
      language: 'en',
    },
    {
      sequence: 2,
      sourceEventKey: 't',
      speaker: 'tutor',
      text: 'Here is a room',
      language: 'en',
    },
    {
      sequence: 3,
      sourceEventKey: 'h',
      speaker: 'help',
      text: 'No entiendo',
      language: 'es',
    },
  ],
  partial: false,
  synthetic: true,
};
const report = () => ({
  schemaVersion: 'report-v1',
  rubricVersion: 'pilot-text-v1',
  strengths: [
    {
      text: 'Clear request',
      explanation: 'Limited evidence',
      practice: 'Ask again',
      uncertainty: 'high',
      evidence: [{ turnSequence: 1, start: 0, end: 6, quote: 'I need' }],
    },
  ],
  corrections: [],
});
afterEach(() => vi.useRealTimers());
describe('application report trust boundary', () => {
  it('accepts exact UTF-16 spans from real learner turns', () => {
    const r = report();
    r.strengths[0]!.evidence[0] = {
      turnSequence: 1,
      start: 14,
      end: 16,
      quote: '🏨',
    };
    expect(validateReport(r, transcript)).toEqual(r);
  });
  it.each<[string, number, number, number, string]>([
    ['unknown', 99, 0, 6, 'I need'],
    ['tutor', 2, 0, 4, 'Here'],
    ['help', 3, 0, 11, 'No entiendo'],
    ['fabricated', 1, 0, 6, 'We need'],
    ['wrong offset', 1, 1, 7, 'I need'],
    ['negative', 1, -1, 5, 'I need'],
    ['overflow', 1, 0, 100, 'I need'],
    ['empty span', 1, 0, 0, 'I need'],
  ])('rejects %s evidence', (_label, sequence, start, end, quote) => {
    const r = report();
    r.strengths[0]!.evidence[0] = { turnSequence: sequence, start, end, quote };
    expect(() => validateReport(r, transcript)).toThrow(AiError);
  });
  it('rejects unsupported versions, fields, missing evidence, excessive priorities and malformed content', () => {
    const base = report();
    for (const r of [
      null,
      {},
      { ...base, schemaVersion: 'report-v99' },
      { ...base, rubricVersion: 'invented' },
      { ...base, accountId: 'other' },
      { ...base, corrections: Array(4).fill(base.strengths[0]) },
      { ...base, strengths: [{ ...base.strengths[0], evidence: [] }] },
      { ...base, strengths: [{ ...base.strengths[0], text: 'x'.repeat(501) }] },
      { ...base, strengths: [{ ...base.strengths[0], uncertainty: 0.99 }] },
    ])
      expect(() => validateReport(r, transcript)).toThrow(AiError);
  });
  it('never fabricates feedback for empty sessions', () => {
    expect(() =>
      validateReport(report(), { ...transcript, turns: [] }),
    ).toThrow(AiError);
    expect(() =>
      validateReport({ ...report(), strengths: [] }, transcript),
    ).toThrow(AiError);
  });
  it('does not partially accept a report with one invalid finding', () => {
    const r = report();
    r.corrections.push({
      ...r.strengths[0]!,
      evidence: [{ turnSequence: 999, start: 0, end: 1, quote: 'x' }],
    } as never);
    expect(() => validateReport(r, transcript)).toThrow('invalid-evidence');
  });
  it('bounds an uncooperative provider and supports immediate cancellation', async () => {
    vi.useFakeTimers();
    const pending = beforeDeadline(new Promise(() => undefined), {
      deadline: new Date(Date.now() + 10),
    });
    const assertion = expect(pending).rejects.toThrow('timeout');
    await vi.advanceTimersByTimeAsync(11);
    await assertion;
    const controller = new AbortController();
    const cancelled = beforeDeadline(new Promise(() => undefined), {
      deadline: new Date(Date.now() + 1000),
      signal: controller.signal,
    });
    controller.abort();
    await expect(cancelled).rejects.toThrow('cancelled');
    expect(vi.getTimerCount()).toBe(0);
  });
  it('rejects treating an explicit help request as a grammar correction', () => {
    const r = report();
    r.corrections.push({
      ...r.strengths[0]!,
      evidence: [{ turnSequence: 1, start: 0, end: 11, quote: 'No entiendo' }],
    } as never);
    expect(() =>
      validateReport(r, {
        ...transcript,
        turns: [{ ...transcript.turns[0]!, text: 'No entiendo' }],
      }),
    ).toThrow('invalid-evidence');
  });
});
