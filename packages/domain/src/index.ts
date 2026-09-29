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

export const CONSENT_PURPOSE = 'gemini-free-ai-practice';
export const POLICY_VERSION = 'privacy-2026-09-29';
export const PROVIDER_DISCLOSURE_VERSION = 'gemini-free-2026-09-29';

export function validateConsent(input: { purpose: string; policyVersion: string; providerDisclosureVersion: string; accepted: boolean }): void {
  if (!input.accepted || input.purpose !== CONSENT_PURPOSE || input.policyVersion !== POLICY_VERSION || input.providerDisclosureVersion !== PROVIDER_DISCLOSURE_VERSION) throw new Error('INVALID_CONSENT_VERSION');
}
