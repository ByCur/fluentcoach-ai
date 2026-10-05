import {
  AiError,
  ANALYSIS_PROMPT_VERSION,
  REPORT_SCHEMA_VERSION,
  RUBRIC_VERSION,
  type AiCallOptions,
  type AnalysisTranscript,
  type SessionAnalyzer,
} from '@fluentcoach/application';
export type FakeAnalysisScenario =
  | 'valid'
  | 'malformed'
  | 'fabricated-evidence'
  | 'rate-limited'
  | 'timeout';
export class FakeSessionAnalyzer implements SessionAnalyzer {
  private failures = new Map<string, number>();
  constructor(private readonly scenario: FakeAnalysisScenario = 'valid') {}
  analyzeTranscript(transcript: AnalysisTranscript, options: AiCallOptions) {
    if (options.signal?.aborted)
      return Promise.reject(new AiError('cancelled'));
    if (options.deadline.getTime() <= Date.now() || this.scenario === 'timeout')
      return Promise.reject(new AiError('timeout'));
    if (this.scenario === 'rate-limited')
      return Promise.reject(new AiError('rate-limited'));
    const learner = transcript.turns.find(
      (t) => t.speaker === 'learner' && !/no entiendo|i don.t understand/i.test(t.text),
    );
    if (!learner) return Promise.reject(new AiError('invalid-evidence'));
    if (learner.text === 'SYNTHETIC_REPORT_FAILURE') {
      const count = this.failures.get(transcript.sessionId) ?? 0;
      this.failures.set(transcript.sessionId, count + 1);
      if (count < 3) return Promise.reject(new AiError('unavailable'));
    }
    const finding = {
      text: 'Has comunicado tu intención.',
      explanation:
        'Este turno aporta evidencia limitada de práctica escrita; no es una evaluación certificada.',
      practice: 'Repite la idea con una frase completa en inglés.',
      uncertainty: 'high',
      evidence: [
        {
          turnSequence: learner.sequence,
          start: 0,
          end: learner.text.length,
          quote:
            this.scenario === 'fabricated-evidence'
              ? 'Invented learner quote'
              : learner.text,
        },
      ],
    };
    return Promise.resolve({
      draft:
        this.scenario === 'malformed'
          ? { unexpected: true }
          : {
              schemaVersion: REPORT_SCHEMA_VERSION,
              rubricVersion: RUBRIC_VERSION,
              strengths: [finding],
              corrections: [],
            },
      metadata: {
        adapter: 'fake',
        model: 'deterministic-v2',
        promptVersion: ANALYSIS_PROMPT_VERSION,
        schemaVersion: REPORT_SCHEMA_VERSION,
        inputTokens: 100,
        outputTokens: 80,
        latencyMs: 0,
        finishReason: 'STOP',
      },
    });
  }
}
