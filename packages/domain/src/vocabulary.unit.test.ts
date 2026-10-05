import { describe, expect, it } from 'vitest';
import { isVocabularyDue, normalizeVocabularyText, scheduleVocabularyReview, vocabularyIdentity } from './vocabulary.js';
describe('vocabulary identity and scheduler', () => {
  it('normalizes compatibility, case, whitespace, and punctuation without semantic merging', () => {
    expect(normalizeVocabularyText('  ＨＥＬＬＯ,   world! ')).toBe('hello world');
    expect(vocabularyIdentity('Bank', 'financial institution')).not.toEqual(vocabularyIdentity('Bank', 'river edge'));
  });
  it.each([['again',10],['hard',1440],['good',1440],['easy',5760]] as const)('schedules new %s deterministically', (rating, minutes) => {
    expect(scheduleVocabularyReview({intervalMinutes:0,repetitions:0},rating,new Date('2026-03-08T00:00:00.000Z'))).toEqual({intervalMinutes:minutes,repetitions:rating==='again'?0:1,nextDueAt:new Date(Date.parse('2026-03-08T00:00:00.000Z')+minutes*60000).toISOString()});
  });
  it('caps intervals and is UTC/DST independent', () => {
    expect(scheduleVocabularyReview({intervalMinutes:300000,repetitions:9},'easy',new Date('2026-11-01T05:59:59.000Z')).intervalMinutes).toBe(259200);
  });
  it('uses inclusive instant boundaries across UTC midnight',()=>{const due=new Date('2026-10-06T00:00:00.000Z');expect(isVocabularyDue(due,new Date('2026-10-05T23:59:59.999Z'))).toBe(false);expect(isVocabularyDue(due,new Date('2026-10-06T00:00:00.000Z'))).toBe(true);expect(isVocabularyDue(due,new Date('2026-10-06T00:00:00.001Z'))).toBe(true);});
});
