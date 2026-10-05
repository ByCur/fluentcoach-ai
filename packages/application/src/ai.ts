import type { ConversationTurn, SessionSnapshot } from '@fluentcoach/domain';
export const TUTOR_PROMPT_VERSION = 'tutor-v4';
export const ANALYSIS_PROMPT_VERSION = 'analysis-v2';
export const REPORT_SCHEMA_VERSION = 'report-v1';
export const RUBRIC_VERSION = 'pilot-text-v1';
export type AiErrorCode =
  | 'rate-limited'
  | 'timeout'
  | 'cancelled'
  | 'unavailable'
  | 'invalid-output'
  | 'invalid-evidence'
  | 'unauthorized'
  | 'budget-exhausted'
  | 'unsupported-capability';
export class AiError extends Error {
  override name = 'AiError';
  constructor(readonly code: AiErrorCode) {
    super(code);
  }
}
export interface AiCallOptions {
  deadline: Date;
  signal?: AbortSignal;
}
export interface ProviderMetadata {
  adapter: string;
  model: string;
  promptVersion: string;
  schemaVersion: string;
  requestId?: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  finishReason: string;
}
export interface Evidence {
  turnSequence: number;
  start: number;
  end: number;
  quote: string;
}
export interface Finding {
  text: string;
  explanation: string;
  practice: string;
  uncertainty: 'low' | 'medium' | 'high';
  evidence: Evidence[];
}
export interface ReportDraft {
  schemaVersion: 'report-v1';
  rubricVersion: 'pilot-text-v1';
  strengths: Finding[];
  corrections: Finding[];
}
export interface AnalysisTranscript {
  accountId: string;
  sessionId: string;
  revision: number;
  snapshot: SessionSnapshot;
  turns: readonly ConversationTurn[];
  partial: boolean;
  synthetic: boolean;
}
export interface SessionAnalyzer {
  analyzeTranscript(
    transcript: AnalysisTranscript,
    options: AiCallOptions,
  ): Promise<{ draft: unknown; metadata: ProviderMetadata }>;
}
export interface ReportResult {
  providerRunId: string;
  report?: ReportDraft;
  metadata?: ProviderMetadata;
}
export interface ReportView {
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped';
  errorCode?: string;
  report?: ReportDraft;
  partial: boolean;
  revision: number;
}
export interface ReportRepository {
  transcript(job: {
    analysisRunId: string;
    accountId: string;
    sessionId: string;
    transcriptRevision: number;
  }): Promise<AnalysisTranscript>;
  view(accountId: string, sessionId: string): Promise<ReportView>;
  retry(accountId: string, sessionId: string): Promise<void>;
}
const invalid = (): never => {
  throw new AiError('invalid-output');
};
function object(raw: unknown, keys: string[]): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return invalid();
  const value = raw as Record<string, unknown>;
  if (
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !(key in value))
  )
    return invalid();
  return value;
}
function boundedString(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    return invalid();
  return value;
}
function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    return invalid();
  return value;
}
export function validateReport(
  raw: unknown,
  transcript: AnalysisTranscript,
): ReportDraft {
  const r = object(raw, [
    'schemaVersion',
    'rubricVersion',
    'strengths',
    'corrections',
  ]);
  if (
    r['schemaVersion'] !== REPORT_SCHEMA_VERSION ||
    r['rubricVersion'] !== RUBRIC_VERSION
  )
    return invalid();
  const parseFindings = (value: unknown, max: number): Finding[] => {
    if (!Array.isArray(value) || value.length > max) return invalid();
    return value.map((rawFinding: unknown) => {
      const f = object(rawFinding, [
        'text',
        'explanation',
        'practice',
        'uncertainty',
        'evidence',
      ]);
      if (
        !['low', 'medium', 'high'].includes(String(f['uncertainty'])) ||
        !Array.isArray(f['evidence']) ||
        f['evidence'].length < 1 ||
        f['evidence'].length > 3
      )
        return invalid();
      const evidence = f['evidence'].map((rawEvidence: unknown): Evidence => {
        const e = object(rawEvidence, [
          'turnSequence',
          'start',
          'end',
          'quote',
        ]);
        const result = {
          turnSequence: integer(e['turnSequence']),
          start: integer(e['start']),
          end: integer(e['end']),
          quote: boundedString(e['quote'], 2000),
        };
        const turn = transcript.turns.find(
          (t) => t.sequence === result.turnSequence,
        );
        if (
          !turn ||
          turn.speaker !== 'learner' ||
          /no entiendo|i don.t understand/i.test(turn.text) ||
          result.end <= result.start ||
          result.end > turn.text.length ||
          turn.text.slice(result.start, result.end) !== result.quote
        )
          throw new AiError('invalid-evidence');
        return result;
      });
      return {
        text: boundedString(f['text'], 500),
        explanation: boundedString(f['explanation'], 1000),
        practice: boundedString(f['practice'], 500),
        uncertainty: f['uncertainty'] as Finding['uncertainty'],
        evidence,
      };
    });
  };
  const report: ReportDraft = {
    schemaVersion: REPORT_SCHEMA_VERSION,
    rubricVersion: RUBRIC_VERSION,
    strengths: parseFindings(r['strengths'], 3),
    corrections: parseFindings(r['corrections'], 3),
  };
  if (
    !transcript.turns.some((t) => t.speaker === 'learner') ||
    (!report.strengths.length && !report.corrections.length)
  )
    return invalid();
  return report;
}
export const REPORT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'rubricVersion', 'strengths', 'corrections'],
  properties: {
    schemaVersion: { type: 'string', enum: [REPORT_SCHEMA_VERSION] },
    rubricVersion: { type: 'string', enum: [RUBRIC_VERSION] },
    ...Object.fromEntries(
      ['strengths', 'corrections'].map((key) => [
        key,
        {
          type: 'array',
          maxItems: 3,
          items: {
            type: 'object',
            additionalProperties: false,
            required: [
              'text',
              'explanation',
              'practice',
              'uncertainty',
              'evidence',
            ],
            properties: {
              text: { type: 'string', maxLength: 500 },
              explanation: { type: 'string', maxLength: 1000 },
              practice: { type: 'string', maxLength: 500 },
              uncertainty: { type: 'string', enum: ['low', 'medium', 'high'] },
              evidence: {
                type: 'array',
                minItems: 1,
                maxItems: 3,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['turnSequence', 'start', 'end', 'quote'],
                  properties: {
                    turnSequence: { type: 'integer', minimum: 1 },
                    start: { type: 'integer', minimum: 0 },
                    end: { type: 'integer', minimum: 1 },
                    quote: { type: 'string', maxLength: 2000 },
                  },
                },
              },
            },
          },
        },
      ]),
    ),
  },
} as const;
export class ReportService {
  constructor(
    private readonly repository: ReportRepository,
    private readonly analyzer: SessionAnalyzer,
  ) {}
  async analyze(job: {
    analysisRunId: string;
    accountId: string;
    sessionId: string;
    transcriptRevision: number;
  }): Promise<ReportResult> {
    const transcript = await this.repository.transcript(job);
    const controller = new AbortController();
    const deadline = new Date(Date.now() + 25_000);
    const timer = setTimeout(
      () => controller.abort(new AiError('timeout')),
      25_000,
    );
    try {
      const result = await beforeDeadline(
        this.analyzer.analyzeTranscript(transcript, {
          deadline,
          signal: controller.signal,
        }),
        { deadline, signal: controller.signal },
      );
      if (controller.signal.aborted) throw new AiError('timeout');
      return {
        providerRunId: crypto.randomUUID(),
        report: validateReport(result.draft, transcript),
        metadata: result.metadata,
      };
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }
  view(accountId: string, sessionId: string) {
    return this.repository.view(accountId, sessionId);
  }
  retry(accountId: string, sessionId: string) {
    return this.repository.retry(accountId, sessionId);
  }
}
export function beforeDeadline<T>(
  operation: Promise<T>,
  options: AiCallOptions,
): Promise<T> {
  if (options.signal?.aborted) return Promise.reject(new AiError('cancelled'));
  const remaining = options.deadline.getTime() - Date.now();
  if (!Number.isFinite(remaining) || remaining <= 0)
    return Promise.reject(new AiError('timeout'));
  return new Promise<T>((resolve, reject) => {
    const cancel = () => {
      cleanup();
      reject(
        options.signal?.reason instanceof AiError
          ? options.signal.reason
          : new AiError('cancelled'),
      );
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new AiError('timeout'));
    }, remaining);
    const cleanup = () => {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', cancel);
    };
    options.signal?.addEventListener('abort', cancel, { once: true });
    operation.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error instanceof AiError ? error : new AiError('unavailable'));
      },
    );
  });
}
