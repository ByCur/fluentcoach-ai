import {
  SCENARIOS,
  type ConversationMode,
  type SessionSnapshot,
} from '@fluentcoach/domain';
export const PILOT_TEXT_SUITE_VERSION = 'pilot-text-fixtures-v3';
// Synthetic-only review matrix: each case checks policy and evidence mechanically.
// Human live review must additionally score usefulness, level fit, scenario coherence and Spanish clarity.
const inputs: Record<(typeof SCENARIOS)[number]['slug'], string> = {
  introductions: 'I live in Madrid and work in a shop',
  'past-experiences': 'Last weekend I visit my friends',
  'family-friends': 'My sister live near my house',
  work: 'I have a meeting with my colleague tomorrow',
  hobbies: 'I enjoy reading books in my free time',
  'future-plans': 'Next year I will travel with my family',
  opinions: 'I think public transport is very useful',
  'problem-solving': 'My train is cancelled and I need another ticket',
  restaurant: 'I want order soup',
  travel: 'Where is train station?',
  hotel: 'I need room for two nights',
  shopping: 'This shoes is too small',
  'doctor-visit': 'I have a headache since yesterday',
  'free-conversation': 'Yesterday I go to the park',
};
export const PILOT_TEXT_CASES = SCENARIOS.flatMap((scenario) =>
  (['A1', 'A2', 'B1', 'B2'] as const).flatMap((level) =>
    (['natural', 'teaching'] as ConversationMode[]).map((mode) => ({
      id: `${scenario.slug}-${level}-${mode}`,
      snapshot: {
        scenarioSlug: scenario.slug,
        scenarioVersion: scenario.version,
        level,
        mode,
        promptVersion: 'tutor-v4',
      } satisfies SessionSnapshot,
      input: inputs[scenario.slug],
      rubric: {
        maxWords:
          level === 'A1'
            ? 50
            : level === 'A2'
              ? 70
              : level === 'B1'
                ? 100
                : 120,
        naturalDefersCorrections: mode === 'natural',
        teachingOneCorrection: mode === 'teaching',
        helpReturnsToEnglish: true,
        evidenceMustMatchLearner: true,
        humanReview: [
          'level fit',
          'useful follow-up',
          'scenario coherence',
          'correction usefulness',
          'Spanish help clarity',
          'Spanish help explains the most recent tutor turn, never the help phrase',
          'exactly two short parts: Spanish first, then one simpler English equivalent under 60 words',
          'English help preserves tutor intent without new requests, choices, details or information',
          'evidence supports finding',
        ],
      },
    })),
  ),
);
