import { describe, it, expect } from 'vitest';
import { TUTOR_PROMPT_VERSION } from '@fluentcoach/application';
import { FakeConversationProvider } from '@fluentcoach/testing';
import { PILOT_TEXT_CASES, PILOT_TEXT_SUITE_VERSION } from '../evals/pilot-text.js';

describe('conversation provider contract', () => {
  it('streams bounded normalized English output for both policies', async () => {
    for (const mode of ['natural', 'teaching'] as const) {
      const chunks = [];
      for await (const chunk of new FakeConversationProvider().stream({
        snapshot: { scenarioSlug: 'hotel', scenarioVersion: 1, level: 'B1', mode, promptVersion: TUTOR_PROMPT_VERSION },
        recentTurns: [],
      }, 'Need a room')) chunks.push(chunk);
      expect(chunks.at(-1)?.done).toBe(true);
      expect(chunks.map(chunk => chunk.text).join('')).toContain('Need a room');
    }
  });

  it('keeps all 112 synthetic eval fixtures on tutor-v4 with the grounded-help review rubric', () => {
    expect(TUTOR_PROMPT_VERSION).toBe('tutor-v4');
    expect(PILOT_TEXT_SUITE_VERSION).toBe('pilot-text-fixtures-v3');
    expect(PILOT_TEXT_CASES).toHaveLength(112);
    expect(new Set(PILOT_TEXT_CASES.map(f => f.snapshot.level))).toEqual(new Set(['A1', 'A2', 'B1', 'B2']));
    expect(new Set(PILOT_TEXT_CASES.map(f => f.snapshot.mode))).toEqual(new Set(['natural', 'teaching']));
    for (const fixture of PILOT_TEXT_CASES) {
      expect(fixture.snapshot.promptVersion).toBe(TUTOR_PROMPT_VERSION);
      expect(fixture.rubric.humanReview).toContain('Spanish help explains the most recent tutor turn, never the help phrase');
      expect(fixture.rubric.humanReview).toContain('English help preserves tutor intent without new requests, choices, details or information');
    }
  });
});
