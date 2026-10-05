import {
  VOCABULARY_SCHEDULER_VERSION,
  VOCABULARY_SUGGESTION_VERSION,
  vocabularyIdentity,
  type ReviewRating,
} from '@fluentcoach/domain';
import type { AnalysisTranscript, ReportDraft } from './ai.js';

export interface VocabularySuggestion {
  id: string; phrase: string; normalizedPhrase: string; meaning: string | null;
  state: 'pending'|'confirmed'|'ignored'|'invalidated'; sourceSessionId: string; sourceReportId: string | null;
  sourceRevision: number | null; evidence: unknown; originVersion: string; sourceAvailable: boolean; createdAt: string;
}
export interface VocabularyCard {
  id: string; phrase: string; normalizedPhrase: string; meaning: string | null;
  state: 'active'|'suspended'; schedulerVersion: string; dueAt: string; intervalMinutes: number;
  repetitions: number; version: number; sourceAvailable: boolean; createdAt: string; updatedAt: string;
}
export interface ReviewResult { card: VocabularyCard; review: { id:string; reviewKey:string; rating:ReviewRating; reviewedAt:string; nextDueAt:string; previousState:unknown; resultingState:unknown } }
export interface VocabularyRepository {
  listSuggestions(accountId:string):Promise<VocabularySuggestion[]>;
  confirm(accountId:string,id:string):Promise<VocabularyCard>;
  ignore(accountId:string,id:string):Promise<void>;
  listCards(accountId:string):Promise<VocabularyCard[]>;
  due(accountId:string,limit:number):Promise<VocabularyCard[]>;
  review(accountId:string,cardId:string,input:{rating:ReviewRating;reviewKey:string;expectedVersion:number}):Promise<ReviewResult>;
  history(accountId:string,cardId:string):Promise<ReviewResult['review'][]>;
}

const INSTRUCTIONAL_OR_META = /\b(?:repite|practica|escribe|intenta|vuelve|corrige|traduce|frase|oraci[oó]n|idea|ingl[eé]s|gram[aá]tica|palabra)\b/i;
/** Fail closed: short phrase-shaped English text only, never Spanish instructional prose. */
export function isVocabularyCandidate(value:string):boolean {
  const phrase=value.trim(), words=phrase.match(/[A-Za-z]+(?:['’][A-Za-z]+)?/g) ?? [];
  return phrase.length >= 2 && phrase.length <= 160 && words.length >= 1 && words.length <= 12 &&
    !INSTRUCTIONAL_OR_META.test(phrase) && !/^(?:no entiendo|i don['’]?t understand)$/i.test(phrase) && !/[áéíóúüñ¿¡]/i.test(phrase) &&
    words.join('').length >= phrase.replace(/[^A-Za-z]/g,'').length * 0.8;
}

/** Corrections only; the practice proposal is context, never represented as a learner quote. */
export function vocabularySuggestionsFromReport(report:ReportDraft, transcript:AnalysisTranscript) {
  return report.corrections.flatMap((finding) => {
    const phrase = finding.practice.trim();
    if (!isVocabularyCandidate(phrase) || /^(no entiendo|i don['’]?t understand)$/i.test(phrase)) return [];
    const identity = vocabularyIdentity(phrase, finding.explanation);
    return [{ phrase, meaning:finding.explanation.trim(), ...identity,
      evidence:{ kind:'report-correction', references:finding.evidence.map(e=>({turnSequence:e.turnSequence,start:e.start,end:e.end})) },
      sourceSessionId:transcript.sessionId, sourceRevision:transcript.revision,
      originVersion:VOCABULARY_SUGGESTION_VERSION }];
  });
}
export class VocabularyService {
  constructor(private readonly repository:VocabularyRepository) {}
  suggestions(accountId:string){ return this.repository.listSuggestions(accountId); }
  confirm(accountId:string,id:string){ return this.repository.confirm(accountId,id); }
  ignore(accountId:string,id:string){ return this.repository.ignore(accountId,id); }
  cards(accountId:string){ return this.repository.listCards(accountId); }
  due(accountId:string,limit:number){ return this.repository.due(accountId,limit); }
  review(accountId:string,cardId:string,input:{rating:ReviewRating;reviewKey:string;expectedVersion:number}) { return this.repository.review(accountId,cardId,input); }
  history(accountId:string,cardId:string){ return this.repository.history(accountId,cardId); }
}
export { VOCABULARY_SCHEDULER_VERSION };
