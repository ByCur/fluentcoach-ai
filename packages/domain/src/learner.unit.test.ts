import { describe, expect, it } from 'vitest';
import { CONSENT_PURPOSE, POLICY_VERSION, PROVIDER_DISCLOSURE_VERSION, isCefrLevel, validateConsent, validatePracticeGoal, validateProfile } from './index.js';
describe('learner rules', () => {
  it('allows only A1 through B2', () => { expect(['A1','A2','B1','B2'].every(isCefrLevel)).toBe(true); expect(isCefrLevel('C1')).toBe(false); });
  it('bounds goals', () => { expect(() => validatePracticeGoal(10, 3)).not.toThrow(); expect(() => validatePracticeGoal(0, 8)).toThrow(); });
  it('validates language, timezone and interests', () => { expect(() => validateProfile({interfaceLanguage:'es',nativeLanguage:'es',timezone:'Europe/Madrid',cefrLevel:'B1',interests:['viajes']})).not.toThrow(); expect(() => validateProfile({interfaceLanguage:'es',nativeLanguage:'es',timezone:'Nope/Nope',cefrLevel:'B1',interests:[]})).toThrow('INVALID_TIMEZONE'); });
  it('requires exact current consent versions', () => { const valid={purpose:CONSENT_PURPOSE,policyVersion:POLICY_VERSION,providerDisclosureVersion:PROVIDER_DISCLOSURE_VERSION,accepted:true}; expect(() => validateConsent(valid)).not.toThrow(); expect(() => validateConsent({...valid,policyVersion:'old'})).toThrow('INVALID_CONSENT_VERSION'); });
});
