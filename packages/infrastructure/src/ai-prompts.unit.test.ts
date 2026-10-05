import { describe, expect, it } from 'vitest';
import { TUTOR_PROMPT_VERSION, type TutorContext } from '@fluentcoach/application';
import { tutorPrompt } from './ai-prompts.js';

describe('versioned tutor language policy', () => {
  for (const level of ['A1', 'A2', 'B1', 'B2'] as const) {
    for (const mode of ['natural', 'teaching'] as const) {
      const context: TutorContext = {
        snapshot: {
          scenarioSlug: 'restaurant', scenarioVersion: 1,
          level, mode, promptVersion: TUTOR_PROMPT_VERSION,
        },
        recentTurns: [],
      };
      it(`${level}/${mode}: explicit help starts in Spanish and returns to one simple English prompt`, () => {
        const prompt = tutorPrompt({ ...context, helpLanguage: 'es' });
        expect(prompt).toContain(`[${TUTOR_PROMPT_VERSION};`);
        expect(prompt).toContain('Use the most recent tutor turn in the conversation data as the source of the help');
        expect(prompt).toContain('explain or translate the meaning of that specific tutor turn briefly in Spanish');
        expect(prompt).toContain('Do not ask what "No entiendo" means');
        expect(prompt).toContain('exactly one simpler English paraphrase or question');
        expect(prompt).toContain('preserves the intent of that same tutor turn');
        expect(prompt).toContain('Do not introduce new requests, options, or scenario details');
        expect(prompt).toContain('If there is no earlier tutor turn');
        expect(prompt).toContain('under 60 words total');
        expect(prompt).toContain('Do not treat help as a grammar error');
        expect(prompt).toContain('do not correct or evaluate the help request, even in teaching mode');
        expect(prompt).toContain('not an English translation of the help request');
      });
      it(`${level}/${mode}: normal turns stay in English`, () => {
        const prompt = tutorPrompt(context);
        expect(prompt).toContain('Respond primarily in English');
        expect(prompt).toContain('Spanish help is only for an explicit help request');
        expect(prompt).not.toContain('Use the most recent tutor turn');
        expect(prompt).toContain(mode === 'natural' ? 'Defer grammar' : 'at most one');
      });
    }
  }
});
