import { describe, expect, it } from 'vitest';
import { consentInput, onboardingInput } from './index.js';

const local = {
  purpose: 'local-ai-practice', policyVersion: 'privacy-2026-10-05',
  providerDisclosureVersion: 'local-first-2026-10-05', accepted: true,
};
const legacy = {
  purpose: 'gemini-free-ai-practice', policyVersion: 'privacy-2026-09-29',
  providerDisclosureVersion: 'gemini-free-2026-09-29', accepted: true,
};
const onboarding = {
  profile: { interfaceLanguage: 'es', nativeLanguage: 'es', timezone: 'UTC', cefrLevel: 'A1', interests: [] },
  goal: { minutesPerDay: 10, daysPerWeek: 3 },
};

describe('consent disclosure provenance contract', () => {
  it.each([local, legacy])('accepts the exact $purpose tuple for consent and onboarding', (consent) => {
    expect(consentInput.parse(consent)).toEqual(consent);
    expect(onboardingInput.parse({ ...onboarding, consent }).consent).toEqual(consent);
    expect(consentInput.safeParse({ ...consent, accepted: false }).success).toBe(false);
  });
  it('rejects every mixed tuple and unrelated values before onboarding', () => {
    for (const purpose of [local.purpose, legacy.purpose]) {
      for (const policyVersion of [local.policyVersion, legacy.policyVersion]) {
        for (const providerDisclosureVersion of [local.providerDisclosureVersion, legacy.providerDisclosureVersion]) {
          const consent = { purpose, policyVersion, providerDisclosureVersion, accepted: true };
          if (JSON.stringify(consent) === JSON.stringify(local) || JSON.stringify(consent) === JSON.stringify(legacy)) continue;
          expect(consentInput.safeParse(consent).success).toBe(false);
          expect(onboardingInput.safeParse({ ...onboarding, consent }).success).toBe(false);
        }
      }
    }
    for (const key of ['purpose', 'policyVersion', 'providerDisclosureVersion'] as const) {
      expect(consentInput.safeParse({ ...local, [key]: 'unrelated' }).success).toBe(false);
    }
    expect(consentInput.safeParse({ ...local, accountId: 'forged-owner' }).success).toBe(false);
  });
});
