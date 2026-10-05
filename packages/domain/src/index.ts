export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2'] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

export function isCefrLevel(value: string): value is CefrLevel {
  return CEFR_LEVELS.includes(value as CefrLevel);
}

export function validatePracticeGoal(minutes: number, days: number): void {
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 120) throw new Error('INVALID_PRACTICE_MINUTES');
  if (!Number.isInteger(days) || days < 1 || days > 7) throw new Error('INVALID_PRACTICE_DAYS');
}

export function validateProfile(input: { interfaceLanguage: string; nativeLanguage: string; timezone: string; cefrLevel: string; interests: readonly string[] }): void {
  if (!isCefrLevel(input.cefrLevel)) throw new Error('INVALID_CEFR_LEVEL');
  if (!/^[a-z]{2}(?:-[A-Z]{2})?$/.test(input.interfaceLanguage) || !/^[a-z]{2}(?:-[A-Z]{2})?$/.test(input.nativeLanguage)) throw new Error('INVALID_LANGUAGE');
  try { new Intl.DateTimeFormat('en', { timeZone: input.timezone }); } catch { throw new Error('INVALID_TIMEZONE'); }
  if (input.interests.length > 10 || input.interests.some((interest) => interest.trim().length < 1 || interest.length > 40)) throw new Error('INVALID_INTERESTS');
}

export const CONSENT_PURPOSE = 'local-ai-practice';
export const POLICY_VERSION = 'privacy-2026-10-05';
export const PROVIDER_DISCLOSURE_VERSION = 'local-first-2026-10-05';
export const LEGACY_GEMINI_CONSENT = {
  purpose: 'gemini-free-ai-practice',
  policyVersion: 'privacy-2026-09-29',
  providerDisclosureVersion: 'gemini-free-2026-09-29',
} as const;

export function validateConsent(input: { purpose: string; policyVersion: string; providerDisclosureVersion: string; accepted: boolean }): void {
  const current = input.purpose === CONSENT_PURPOSE &&
    input.policyVersion === POLICY_VERSION &&
    input.providerDisclosureVersion === PROVIDER_DISCLOSURE_VERSION;
  const legacy = input.purpose === LEGACY_GEMINI_CONSENT.purpose &&
    input.policyVersion === LEGACY_GEMINI_CONSENT.policyVersion &&
    input.providerDisclosureVersion === LEGACY_GEMINI_CONSENT.providerDisclosureVersion;
  if (input.accepted !== true || (!current && !legacy)) throw new Error('INVALID_CONSENT_VERSION');
}
export * from './conversation.js';
export * from './issues.js';
export * from './vocabulary.js';
export * from './progress.js';
