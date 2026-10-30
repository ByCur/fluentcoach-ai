import {
  REPORT_JSON_SCHEMA, REPORT_SCHEMA_VERSION, RUBRIC_VERSION,
  type AnalysisTranscript,
} from '@fluentcoach/application';

/** A stricter generation grammar; application validation remains authoritative. */
export function ollamaReportSchema(transcript: AnalysisTranscript) {
  const turns = transcript.turns.filter(turn => turn.speaker === 'learner'
    && turn.text.trim() && !/no entiendo|i don.t understand/i.test(turn.text));
  // Empty/help-only transcripts cannot pass application validation. Keeping the
  // base grammar here also preserves cancellation/deadline handling for callers.
  if (!turns.length) return REPORT_JSON_SCHEMA;
  const citations = turns.flatMap(turn => {
    const spans = [];
    for (let start = 0; start < turn.text.length;) {
      let end = Math.min(start + 2000, turn.text.length);
      // report-v1 quotes are bounded to 2,000 UTF-16 units. Never split a pair.
      if (end < turn.text.length && /[\uD800-\uDBFF]/u.test(turn.text[end - 1]!)) end--;
      const quote = turn.text.slice(start, end);
      if (quote.trim()) spans.push({ turnSequence: turn.sequence, start, end, quote });
      start = end;
    }
    return spans;
  });
  const evidence = {
    type: 'array', minItems: 1, maxItems: 1,
    items: { oneOf: citations.map(citation => ({
      type: 'object', additionalProperties: false,
      required: ['turnSequence', 'start', 'end', 'quote'],
      properties: {
        turnSequence: { type: 'integer', const: citation.turnSequence },
        start: { type: 'integer', const: citation.start },
        end: { type: 'integer', const: citation.end },
        quote: { type: 'string', const: citation.quote },
      },
    })) },
  };
  const finding = {
    type: 'object', additionalProperties: false,
    required: ['text', 'explanation', 'practice', 'uncertainty', 'evidence'],
    properties: {
      text: { type: 'string', minLength: 1, maxLength: 150 },
      explanation: { type: 'string', minLength: 1, maxLength: 300 },
      practice: { type: 'string', minLength: 1, maxLength: 150 },
      uncertainty: { type: 'string', enum: ['low', 'medium', 'high'] },
      evidence,
    },
  };
  return {
    type: 'object', additionalProperties: false,
    required: ['schemaVersion', 'rubricVersion', 'strengths', 'corrections'],
    properties: {
      schemaVersion: { type: 'string', enum: [REPORT_SCHEMA_VERSION] },
      rubricVersion: { type: 'string', enum: [RUBRIC_VERSION] },
      strengths: { type: 'array', minItems: 1, maxItems: 1, items: finding },
      corrections: { type: 'array', maxItems: 1, items: finding },
    },
  };
}
