export const VOCABULARY_SUGGESTION_VERSION = 'vocabulary-suggestion-v1' as const;
export const VOCABULARY_SCHEDULER_VERSION = 'vocab-scheduler-v1' as const;
export const REVIEW_RATINGS = ['again', 'hard', 'good', 'easy'] as const;
export type ReviewRating = (typeof REVIEW_RATINGS)[number];

/** Unicode-aware identity normalization: compatibility form, case fold, trim punctuation, collapse whitespace. */
export function normalizeVocabularyText(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en')
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function vocabularyIdentity(phrase: string, sense?: string | null) {
  const normalizedPhrase = normalizeVocabularyText(phrase);
  const normalizedSense = normalizeVocabularyText(sense ?? '');
  if (!normalizedPhrase) throw Error('INVALID_VOCABULARY_PHRASE');
  return { normalizedPhrase, normalizedSense };
}

export interface SchedulingState {
  intervalMinutes: number;
  repetitions: number;
}
export interface SchedulingResult extends SchedulingState {
  nextDueAt: string;
}
export function isVocabularyDue(dueAt: Date, now: Date): boolean {
  return dueAt.getTime() <= now.getTime();
}
const MINUTES_PER_DAY = 1_440;
const MAX_INTERVAL = 180 * MINUTES_PER_DAY;

/** Pure UTC/instant scheduler. It is deliberately small and is not claimed to be optimal. */
export function scheduleVocabularyReview(
  previous: SchedulingState,
  rating: ReviewRating,
  reviewedAt: Date,
  version: string = VOCABULARY_SCHEDULER_VERSION,
): SchedulingResult {
  if (version !== VOCABULARY_SCHEDULER_VERSION || Number.isNaN(reviewedAt.getTime()))
    throw Error('UNSUPPORTED_SCHEDULER_VERSION');
  const current = Math.max(0, Math.min(MAX_INTERVAL, previous.intervalMinutes));
  const intervalMinutes = Math.max(
    10,
    Math.min(
      MAX_INTERVAL,
      rating === 'again'
        ? 10
        : rating === 'hard'
          ? Math.max(MINUTES_PER_DAY, Math.round(current * 1.2))
          : rating === 'good'
            ? Math.max(MINUTES_PER_DAY, Math.round(current * 2.5))
            : Math.max(4 * MINUTES_PER_DAY, Math.round(current * 4)),
    ),
  );
  return {
    intervalMinutes,
    repetitions: rating === 'again' ? 0 : previous.repetitions + 1,
    nextDueAt: new Date(reviewedAt.getTime() + intervalMinutes * 60_000).toISOString(),
  };
}
