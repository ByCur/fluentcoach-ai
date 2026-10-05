import { describe, expect, it } from 'vitest';
import { CONSENT_PURPOSE, POLICY_VERSION, PROVIDER_DISCLOSURE_VERSION, isCefrLevel, validateConsent, validatePracticeGoal, validateProfile } from './index.js';
describe('learner rules', () => {
  it('allows only A1 through B2', () => { expect(['A1','A2','B1','B2'].every(isCefrLevel)).toBe(true); expect(isCefrLevel('C1')).toBe(false); });
  it('bounds goals', () => { expect(() => validatePracticeGoal(10, 3)).not.toThrow(); expect(() => validatePracticeGoal(0, 8)).toThrow(); });
  it('validates language, timezone and interests', () => { expect(() => validateProfile({interfaceLanguage:'es',nativeLanguage:'es',timezone:'Europe/Madrid',cefrLevel:'B1',interests:['viajes']})).not.toThrow(); expect(() => validateProfile({interfaceLanguage:'es',nativeLanguage:'es',timezone:'Nope/Nope',cefrLevel:'B1',interests:[]})).toThrow('INVALID_TIMEZONE'); });
  it('requires exact current consent versions', () => { const valid={purpose:CONSENT_PURPOSE,policyVersion:POLICY_VERSION,providerDisclosureVersion:PROVIDER_DISCLOSURE_VERSION,accepted:true}; expect(() => validateConsent(valid)).not.toThrow(); expect(() => validateConsent({...valid,policyVersion:'old'})).toThrow('INVALID_CONSENT_VERSION'); });
  it('preserves the exact historical Gemini tuple', () => {
    expect(() => validateConsent({ purpose: 'gemini-free-ai-practice', policyVersion: 'privacy-2026-09-29', providerDisclosureVersion: 'gemini-free-2026-09-29', accepted: true })).not.toThrow();
  });
  it('rejects mixed disclosure tuples and unaccepted consent', () => {
    for (const purpose of ['local-ai-practice', 'gemini-free-ai-practice']) {
      for (const policyVersion of ['privacy-2026-10-05', 'privacy-2026-09-29']) {
        for (const providerDisclosureVersion of ['local-first-2026-10-05', 'gemini-free-2026-09-29']) {
          const isLocal = purpose === 'local-ai-practice' && policyVersion === 'privacy-2026-10-05' && providerDisclosureVersion === 'local-first-2026-10-05';
          const isLegacy = purpose === 'gemini-free-ai-practice' && policyVersion === 'privacy-2026-09-29' && providerDisclosureVersion === 'gemini-free-2026-09-29';
          expect(() => validateConsent({ purpose, policyVersion, providerDisclosureVersion, accepted: false })).toThrow('INVALID_CONSENT_VERSION');
          if (!isLocal && !isLegacy) expect(() => validateConsent({ purpose, policyVersion, providerDisclosureVersion, accepted: true })).toThrow('INVALID_CONSENT_VERSION');
        }
      }
    }
  });
});
