import { expect, it } from 'vitest';
import { REPORT_JSON_SCHEMA, validateReport, type AnalysisTranscript } from '@fluentcoach/application';
import { ollamaReportSchema } from './ollama-report-schema.js';

const transcript: AnalysisTranscript = {
  accountId: 'synthetic-account', sessionId: 'synthetic-session', revision: 1,
  snapshot: {scenarioSlug: 'hotel', scenarioVersion: 1, level: 'A2', mode: 'teaching', promptVersion: 'tutor-v4'},
  turns: [
    {sequence: 1, sourceEventKey: 'a', speaker: 'learner', text: 'Yesterday I go 😀.', language: 'en'},
    {sequence: 2, sourceEventKey: 'b', speaker: 'tutor', text: 'TUTOR_NOT_EVIDENCE', language: 'en'},
    {sequence: 3, sourceEventKey: 'c', speaker: 'help', text: 'HELP_NOT_EVIDENCE', language: 'es'},
    {sequence: 4, sourceEventKey: 'd', speaker: 'learner', text: 'No entiendo.', language: 'es'},
    {sequence: 5, sourceEventKey: 'e', speaker: 'learner', text: 'I would like a room.', language: 'en'},
  ], partial: false, synthetic: true,
};
type Schema = {properties: {strengths: {maxItems: number; items: {properties: {evidence: {items: {oneOf: {properties: Record<string, {const: string | number}>}[]}}}}}; corrections: {maxItems: number}}};
const choices = (value: AnalysisTranscript) => (ollamaReportSchema(value) as Schema).properties.strengths.items.properties.evidence.items.oneOf
  .map(option => Object.fromEntries(Object.entries(option.properties).map(([key, property]) => [key, property.const])));

it('constrains whole citation tuples to owned learner text, excludes tutor/help and counts UTF-16 exactly', () => {
  expect(choices(transcript)).toEqual([
    {turnSequence: 1, start: 0, end: 18, quote: transcript.turns[0]!.text},
    {turnSequence: 5, start: 0, end: 20, quote: 'I would like a room.'},
  ]);
  const schema = ollamaReportSchema(transcript) as Schema;
  expect(schema.properties.strengths.maxItems).toBe(1);
  expect(schema.properties.corrections.maxItems).toBe(1);
});

it('bounds long voice quotes without splitting Unicode pairs or losing source offsets', () => {
  const text = 'a'.repeat(1999) + '😀' + 'b'.repeat(2000);
  const value = {...transcript, turns: [{...transcript.turns[0]!, text}]};
  const selected = choices(value);
  expect(selected).toHaveLength(3);
  expect(selected.map(citation => citation['quote']).join('')).toBe(text);
  for (const citation of selected) {
    const quote = String(citation['quote']);
    expect(quote.length).toBeLessThanOrEqual(2000);
    expect(quote).toBe(text.slice(Number(citation['start']), Number(citation['end'])));
    expect(Buffer.from(quote, 'utf8').toString('utf8')).toBe(quote);
  }
});

it('keeps application evidence validation strict even if a provider ignores the generation grammar', () => {
  const finding = {text: 'Sintético', explanation: 'Explicación sintética', practice: 'Práctica sintética', uncertainty: 'low', evidence: [choices(transcript)[0]]};
  const draft = {schemaVersion: 'report-v1', rubricVersion: 'pilot-text-v1', strengths: [finding], corrections: []};
  expect(validateReport(draft, transcript).strengths).toHaveLength(1);
  for (const bad of [{turnSequence: 2}, {quote: 'invented'}, {end: 1}, {accountId: 'foreign'}]) {
    expect(() => validateReport({...draft, strengths: [{...finding, evidence: [{...finding.evidence[0], ...bad}]}]}, transcript)).toThrow();
  }
  expect(ollamaReportSchema({...transcript, turns: []})).toBe(REPORT_JSON_SCHEMA);
});
