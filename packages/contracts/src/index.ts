import { OPERATIONAL_LIMITS } from '@fluentcoach/domain';
import { z } from 'zod';

export type HealthResponse = { status: 'ok' | 'not-ready'; service: string };
export const learnerProfileInput = z.object({
  interfaceLanguage: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/), nativeLanguage: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/),
  timezone: z.string().min(1).max(64), cefrLevel: z.enum(['A1', 'A2', 'B1', 'B2']),
  interests: z.array(z.string().trim().min(1).max(40)).max(10), version: z.number().int().positive().optional()
}).strict();
export const practiceGoalInput = z.object({ minutesPerDay: z.number().int().min(5).max(120), daysPerWeek: z.number().int().min(1).max(7) }).strict();
export const consentInput = z.discriminatedUnion('purpose', [
  z.object({
    purpose: z.literal('local-ai-practice'),
    policyVersion: z.literal('privacy-2026-10-05'),
    providerDisclosureVersion: z.literal('local-first-2026-10-05'),
    accepted: z.literal(true),
  }).strict(),
  // Preserve historical clients/records without accepting mixed disclosure versions.
  z.object({
    purpose: z.literal('gemini-free-ai-practice'),
    policyVersion: z.literal('privacy-2026-09-29'),
    providerDisclosureVersion: z.literal('gemini-free-2026-09-29'),
    accepted: z.literal(true),
  }).strict(),
]);
export const onboardingInput = z.object({ profile: learnerProfileInput, goal: practiceGoalInput, consent: consentInput }).strict();
export type LearnerProfileInput = z.infer<typeof learnerProfileInput>;
export type PracticeGoalInput = z.infer<typeof practiceGoalInput>;
export type ConsentInput = z.infer<typeof consentInput>;
export type ApiError = { error: { code: string; message: string } };
export const startSessionInput=z.object({scenarioSlug:z.enum(['restaurant','travel','hotel','shopping','doctor-visit','free-conversation']),level:z.enum(['A1','A2','B1','B2']),mode:z.enum(['natural','teaching'])}).strict();
export const turnInput=z.object({sourceEventKey:z.string().min(1).max(100),activeDurationMs:z.number().int().min(0).max(86400000).optional(),text:z.string().trim().min(1).max(OPERATIONAL_LIMITS.textTurnChars)}).strict();
export const analysisJobInput=z.object({version:z.literal(1),analysisRunId:z.uuid(),accountId:z.uuid(),sessionId:z.uuid(),transcriptRevision:z.number().int().positive(),deletionEpoch:z.number().int().nonnegative().optional()}).strict();

export const issueKeyInput = z.enum(['verb-tense','subject-verb-agreement','articles','prepositions','word-order','vocabulary-choice','singular-plural','auxiliary-verbs']);
export const issueQueryInput = z.object({}).strict();
export const issueActionInput = z.object({}).strict();
export const vocabularyIdInput = z.uuid();
export const vocabularyEmptyInput = z.object({}).strict();
export const dueReviewsQueryInput = z.object({ limit:z.coerce.number().int().min(1).max(OPERATIONAL_LIMITS.reviewPage).default(20) }).strict();
export const vocabularyReviewInput = z.object({
  rating:z.enum(['again','hard','good','easy']),
  reviewKey:z.string().uuid(),
  expectedVersion:z.number().int().positive(),
}).strict();

export const planGenerateInput = z.object({ requestKey: z.string().uuid() }).strict();
export const planVersionInput = z.object({ expectedVersion: z.number().int().positive() }).strict();
export const planRefreshInput = z.object({ requestKey: z.string().uuid(), expectedVersion: z.number().int().positive() }).strict();
export const resourceId = z.string().uuid();
