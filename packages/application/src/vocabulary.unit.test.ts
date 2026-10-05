import { describe,expect,it } from 'vitest';
import { isVocabularyCandidate,vocabularySuggestionsFromReport,type AnalysisTranscript,type ReportDraft } from './index.js';

describe('conservative vocabulary candidates',()=>{
  it.each(['Repite la idea con una frase completa en inglés.','Practica el pasado.','Escribe una oración nueva.','No entiendo', 'I don\'t understand'])(
    'rejects instructional/help text: %s',(text)=>expect(isVocabularyCandidate(text)).toBe(false),
  );
  it.each(['Could I check in, please?','Take a seat','I would rather stay home.'])(
    'accepts a short useful English phrase: %s',(text)=>expect(isVocabularyCandidate(text)).toBe(true),
  );
  it('does not emit meta practice text from an otherwise valid report',()=>{
    const report={schemaVersion:'report-v1',rubricVersion:'pilot-text-v1',strengths:[],corrections:[{text:'verb tense',explanation:'Usa pasado.',practice:'Repite la idea con una frase completa en inglés.',uncertainty:'low',evidence:[{turnSequence:1,start:0,end:4,quote:'I go'}]}]} satisfies ReportDraft;
    const transcript={sessionId:'s',revision:1} as AnalysisTranscript;
    expect(vocabularySuggestionsFromReport(report,transcript)).toEqual([]);
  });
});
