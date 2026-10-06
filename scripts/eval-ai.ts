import {evaluateOpenings} from './eval-openings.js';
import { evaluateRoadmap } from './eval-roadmap.js';
import { parseArgs } from 'node:util';
import { writeFile } from 'node:fs/promises';
import {
  AiError,
  ANALYSIS_PROMPT_VERSION,
  REPORT_SCHEMA_VERSION,
  RUBRIC_VERSION,
  TUTOR_PROMPT_VERSION,
  validateReport,
  type AnalysisTranscript,
  type ConversationProvider,
  type ProviderMetadata,
  type SessionAnalyzer,
} from '@fluentcoach/application';
import {
  GeminiTextAdapter,
  loadAiConfig,
  PostgresAiBudget,
  pool,
} from '@fluentcoach/infrastructure';
import {
  FakeConversationProvider,
  FakeSessionAnalyzer,
} from '@fluentcoach/testing';
import {
  PILOT_TEXT_CASES,
  PILOT_TEXT_SUITE_VERSION,
} from '../tests/evals/pilot-text.js';
async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== '--'),
    options: {
      suite: { type: 'string' },
      'billing-mode': { type: 'string' },
      live: { type: 'boolean', default: false },
      'max-calls': { type: 'string', default: '6' },
      offset: { type: 'string', default: '0' },
      output: {
        type: 'string',
        default: '/tmp/fluentcoach-pilot-text-eval.json',
      },
    },
  });
  if (values.suite === 'tutor-openings' && values['billing-mode'] === 'free_only') {
    await evaluateOpenings({live: values.live, maxCalls: Number(values['max-calls']), output: values.output});
    return;
  }
  if (values.suite === 'plans' && values['billing-mode'] === 'free_only') {
    await evaluateRoadmap({live: values.live, maxCalls: Number(values['max-calls']), output: values.output});
    return;
  }
  if (values.suite !== 'pilot-text' || values['billing-mode'] !== 'free_only')
    throw Error(
      'Use --suite pilot-text --billing-mode free_only. Paid evaluations are forbidden.',
    );
  const maxCalls = Number(values['max-calls']),
    offset = Number(values.offset);
  if (
    !Number.isSafeInteger(maxCalls) ||
    maxCalls < 3 ||
    maxCalls > 6 ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset >= PILOT_TEXT_CASES.length
  )
    throw Error('Live batch limits: 3–6 calls, valid matrix offset.');
  let candidateVerification: unknown = null;
  let calls = 0;
  let conversation: ConversationProvider = new FakeConversationProvider(),
    analyzer: SessionAnalyzer = new FakeSessionAnalyzer();
  if (values.live) {
    const config = loadAiConfig({
      ...process.env,
      AI_PROVIDER: 'gemini-free',
      BILLING_MODE: values['billing-mode'],
    });
    if (config.provider !== 'gemini-free')
      throw Error('Approved Gemini Free configuration required.');
    const adapter = new GeminiTextAdapter(
      config.gemini,
      new PostgresAiBudget(config.gemini.quota, config.gemini.model),
    );
    if (maxCalls < 4)
      throw Error(
        'Live candidate check plus one case requires at least 4 calls.',
      );
    calls++;
    candidateVerification = await adapter.verifyCandidate({
      deadline: new Date(Date.now() + 25000),
    });
    conversation = adapter;
    analyzer = adapter;
  }
  const cases = values.live
    ? PILOT_TEXT_CASES.slice(offset, offset + Math.floor((maxCalls - 1) / 3))
    : PILOT_TEXT_CASES;
  const results: unknown[] = [];
  for (const fixture of cases) {
    const turns = [
      {
        sequence: 1,
        sourceEventKey: fixture.id,
        speaker: 'learner' as const,
        text: fixture.input,
        language: 'en' as const,
      },
    ];
    let reply = '',
      help = '',
      metadata: ProviderMetadata | undefined,
      helpMetadata: ProviderMetadata | undefined;
    const options = () => ({ deadline: new Date(Date.now() + 25_000) });
    calls++;
    for await (const chunk of conversation.stream(
      { snapshot: fixture.snapshot, recentTurns: turns, synthetic: true },
      fixture.input,
      options(),
    )) {
      reply += chunk.text;
      metadata = chunk.metadata ?? metadata;
    }
    calls++;
    for await (const chunk of conversation.stream(
      {
        snapshot: fixture.snapshot,
        recentTurns: [
          ...turns,
          {
            sequence: 2, sourceEventKey: `${fixture.id}:reply`,
            speaker: 'tutor', text: reply, language: 'en',
          },
          {
            sequence: 3, sourceEventKey: `${fixture.id}:help`,
            speaker: 'learner', text: "I don't understand", language: 'en',
          },
        ],
        synthetic: true,
        helpLanguage: 'es',
      },
      "I don't understand",
      options(),
    )) {
      help += chunk.text;
      helpMetadata = chunk.metadata ?? helpMetadata;
    }
    const transcript: AnalysisTranscript = {
      accountId: 'synthetic-eval',
      sessionId: fixture.id,
      revision: 1,
      snapshot: fixture.snapshot,
      turns,
      partial: false,
      synthetic: true,
    };
    calls++;
    const result = await analyzer.analyzeTranscript(transcript, options()),
      report = validateReport(result.draft, transcript);
    const adversarial = structuredClone(report);
    const evidence = (adversarial.strengths[0] ?? adversarial.corrections[0])!
      .evidence[0]!;
    evidence.turnSequence = 999;
    let fabricatedRejected = false;
    try {
      validateReport(adversarial, transcript);
    } catch (error) {
      fabricatedRejected =
        error instanceof AiError && error.code === 'invalid-evidence';
    }
    const malformedRejected = (() => {
      try {
        validateReport({ ...report, schemaVersion: 'unknown' }, transcript);
        return false;
      } catch {
        return true;
      }
    })();
    const words = reply.trim().split(/\s+/).length;
    const helpParts = help.trim().split(/\r?\n/)
      .map((part) => part.trim()).filter(Boolean);
    const checks = {
      boundedLevelLength: words <= fixture.rubric.maxWords,
      hasFollowUp: /\?/.test(reply),
      modePolicy:
        fixture.snapshot.mode === 'natural'
          ? !/quick tip|correction:|you should say/i.test(reply)
          : (reply.match(/quick tip|correction:|you should say/gi)?.length ??
              0) <= 1 && /example|for instance/i.test(reply),
      // Language/meaning/intent require the human rubric. These checks enforce
      // structure without requiring the literal word "English" in the reply.
      helpTwoParts: helpParts.length === 2,
      helpOneEnglishSentence: (helpParts[1]?.match(/[.!?]/g)?.length ?? 0) === 1,
      helpBoundedLength: help.trim().split(/\s+/).length < 60,
      evidenceValidated: true,
      fabricatedRejected,
      malformedRejected,
    };
    results.push({
      id: fixture.id,
      checks,
      metadata: metadata ?? null,
      analysisMetadata: result.metadata,
      helpMetadata: helpMetadata ?? null,
      syntheticReply: reply,
      syntheticHelp: help,
      helpSourceTutorTurn: reply,
      syntheticReport: report,
      humanReviewRequired: fixture.rubric.humanReview,
    });
    if (Object.values(checks).some((value) => !value))
      throw Error(
        `Evaluation policy failed for synthetic case ${fixture.id}; no learner content logged.`,
      );
  }
  const output = {
    suite: 'pilot-text',
    fixtureVersion: PILOT_TEXT_SUITE_VERSION,
    rubricVersion: RUBRIC_VERSION,
    promptVersions: [TUTOR_PROMPT_VERSION, ANALYSIS_PROMPT_VERSION],
    schemaVersion: REPORT_SCHEMA_VERSION,
    billingMode: 'free_only',
    provider: values.live ? 'gemini-free' : 'fake',
    liveEntryGate: values.live
      ? 'partial-synthetic-check-human-review-and-free-tier-verification-required'
      : 'not-run-no-live-validation-claimed',
    humanReviewed: false,
    candidateVerification,
    freeTierReviewId: values.live
      ? (process.env['AI_FREE_TIER_REVIEW_ID'] ?? null)
      : null,
    calls,
    fullMatrixSize: PILOT_TEXT_CASES.length,
    evaluatedCases: cases.length,
    results,
  };
  await writeFile(values.output, JSON.stringify(output, null, 2) + '\n', {
    mode: 0o600,
  });
  console.log(
    `${output.provider}: ${cases.length}/${PILOT_TEXT_CASES.length} synthetic cases, ${calls} calls, policy/evidence checks passed. Human live review pending. Artifact: ${values.output}`,
  );
}
async function run() {
  try {
    await main();
  } finally {
    await pool.end();
  }
}
void run().catch((error) => {
  console.error(
    error instanceof AiError
      ? error.code
      : error instanceof Error
        ? error.message
        : 'Evaluation failed',
  );
  process.exitCode = 1;
});
