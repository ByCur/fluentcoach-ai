import { z } from 'zod';

export type HealthResponse = { status: 'ok' | 'not-ready'; service: string };
export const learnerProfileInput = z.object({
  interfaceLanguage: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/), nativeLanguage: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/),
  timezone: z.string().min(1).max(64), cefrLevel: z.enum(['A1', 'A2', 'B1', 'B2']),
  interests: z.array(z.string().trim().min(1).max(40)).max(10), version: z.number().int().positive().optional()
}).strict();
export const practiceGoalInput = z.object({ minutesPerDay: z.number().int().min(5).max(120), daysPerWeek: z.number().int().min(1).max(7) }).strict();
export const consentInput = z.object({ purpose: z.literal('gemini-free-ai-practice'), policyVersion: z.literal('privacy-2026-09-29'), providerDisclosureVersion: z.literal('gemini-free-2026-09-29'), accepted: z.literal(true) }).strict();
export const onboardingInput = z.object({ profile: learnerProfileInput, goal: practiceGoalInput, consent: consentInput }).strict();
export type LearnerProfileInput = z.infer<typeof learnerProfileInput>;
export type PracticeGoalInput = z.infer<typeof practiceGoalInput>;
export type ConsentInput = z.infer<typeof consentInput>;
export type ApiError = { error: { code: string; message: string } };
export const startSessionInput=z.object({scenarioSlug:z.enum(['restaurant','travel','hotel','shopping','doctor-visit','free-conversation']),level:z.enum(['A1','A2','B1','B2']),mode:z.enum(['natural','teaching'])}).strict();
export const turnInput=z.object({sourceEventKey:z.string().min(1).max(100),text:z.string().trim().min(1).max(2000)}).strict();
export const analysisJobInput=z.object({version:z.literal(1),analysisRunId:z.string().uuid(),accountId:z.string().uuid(),sessionId:z.string().uuid(),transcriptRevision:z.number().int().positive()}).strict();
