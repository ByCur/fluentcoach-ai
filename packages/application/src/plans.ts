import { OPERATIONAL_LIMITS } from '@fluentcoach/domain';
import {
  SCENARIOS,
  ISSUE_TAXONOMY_VERSION,
  type RecurringIssue,
  type SessionSnapshot,
} from '@fluentcoach/domain';
export const PLAN_SCHEMA_VERSION = 'plan-v1';
export const PLAN_GENERATOR_VERSION = 'plan-generator-v1';
export const PLAN_CATALOG_VERSION = 'plan-catalog-v1';
export const PLAN_ACTIVITY_CATALOG = [
  'conversation',
  'recurring-issue-practice',
  'vocabulary-review',
] as const;
export type PlanCandidate = {
  candidateId: string;
  type: (typeof PLAN_ACTIVITY_CATALOG)[number];
  title: string;
  rationale: string;
  targetMinutes: number;
  scenarioSlug?: string;
  level?: SessionSnapshot['level'];
  mode?: SessionSnapshot['mode'];
  taxonomyVersion?: string;
  issueKey?: string;
  evidence?: RecurringIssue['evidence'];
  cardIds?: string[];
  targetCount?: number;
};
export type PlanInputs = {
  level: SessionSnapshot['level'];
  profileVersion: number;
  goal: { minutesPerDay: number; daysPerWeek: number; version: number };
  issues: RecurringIssue[];
  dueCardIds: string[];
  recentScenarioSlugs: string[];
};
const SCENARIO_LABELS: Record<string, string> = {
  restaurant: 'Restaurante',
  travel: 'Viajes',
  hotel: 'Hotel',
  shopping: 'Compras',
  'doctor-visit': 'Consulta médica',
  'free-conversation': 'Conversación libre',
};
export function planCandidates(input: PlanInputs): PlanCandidate[] {
  const minutes = Math.min(
    10,
    Math.max(2, Math.floor(input.goal.minutesPerDay / 2)),
  );
  const scenarios = [...SCENARIOS].sort(
    (a, b) =>
      Number(input.recentScenarioSlugs.includes(a.slug)) -
        Number(input.recentScenarioSlugs.includes(b.slug)) ||
      a.slug.localeCompare(b.slug),
  );
  const result: PlanCandidate[] = input.issues
    .filter((i) => !i.dismissed)
    .slice(0, 2)
    .map((i) => ({
      candidateId: `issue:${i.issueKey}`,
      type: 'recurring-issue-practice',
      title: `Practica: ${i.label}`,
      rationale: `${i.label} apareció en ${i.sessionCount} sesiones (${i.observationCount} observaciones).`,
      targetMinutes: minutes,
      taxonomyVersion: ISSUE_TAXONOMY_VERSION,
      issueKey: i.issueKey,
      evidence: i.evidence,
      scenarioSlug: 'free-conversation',
      level: input.level,
      mode: 'teaching',
    }));
  const cards = [...new Set(input.dueCardIds)].sort().slice(0, 5);
  if (cards.length)
    result.push({
      candidateId: 'due-vocabulary',
      type: 'vocabulary-review',
      title: 'Repasa tus expresiones',
      rationale: `Tienes ${cards.length} expresiones pendientes de repaso.`,
      targetMinutes: Math.min(5, minutes),
      cardIds: cards,
      targetCount: cards.length,
    });
  for (const scenario of scenarios.slice(0, 2))
    result.push({
      candidateId: `conversation:${scenario.slug}`,
      type: 'conversation',
      title: `Conversación: ${SCENARIO_LABELS[scenario.slug]}`,
      rationale: `Basada en tu nivel seleccionado ${input.level} y tu objetivo de ${input.goal.minutesPerDay} minutos, ${input.goal.daysPerWeek} días por semana.`,
      targetMinutes: minutes,
      scenarioSlug: scenario.slug,
      level: input.level,
      mode: 'natural',
    });
  return result;
}
/** A provider can select server candidate IDs only. Database identifiers are never provider output. */
export interface PlanGenerator {
  select(candidates: readonly PlanCandidate[]): Promise<unknown>;
}
export class DeterministicPlanGenerator implements PlanGenerator {
  select(candidates: readonly PlanCandidate[]) {
    return Promise.resolve({
      candidateIds: candidates.slice(0, 4).map((c) => c.candidateId),
    });
  }
}
export function validatePlanSelection(
  raw: unknown,
  candidates: readonly PlanCandidate[],
): PlanCandidate[] {
  if (
    !raw ||
    typeof raw !== 'object' ||
    Array.isArray(raw) ||
    Object.keys(raw).some((k) => k !== 'candidateIds')
  )
    throw Error('PLAN_GENERATION_RETRYABLE');
  const ids = (raw as { candidateIds?: unknown }).candidateIds;
  if (
    !Array.isArray(ids) ||
    ids.length < 2 ||
    ids.length > OPERATIONAL_LIMITS.planActivities ||
    ids.some((id) => typeof id !== 'string') ||
    new Set(ids).size !== ids.length
  )
    throw Error('PLAN_GENERATION_RETRYABLE');
  return ids.map((id) => {
    const candidate = candidates.find((c) => c.candidateId === id);
    if (!candidate || !PLAN_ACTIVITY_CATALOG.includes(candidate.type))
      throw Error('PLAN_GENERATION_RETRYABLE');
    return candidate;
  });
}
export type PlanActivity = PlanCandidate & {
  id: string;
  state: 'pending' | 'started' | 'completed' | 'skipped' | 'unavailable';
  startedAt: string | null;
  sessionId: string | null;
};
export type LearningPlan = {
  id: string;
  schemaVersion: string;
  generatorVersion: string;
  catalogVersion: string;
  version: number;
  state: 'proposal' | 'active' | 'superseded' | 'replaced';
  createdAt: string;
  acceptedAt: string | null;
  sourceSnapshot: PlanInputs;
  rationale: string;
  insufficientData: boolean;
  activities: PlanActivity[];
};
export interface PlanRepository {
  current(
    accountId: string,
  ): Promise<{ active: LearningPlan | null; proposal: LearningPlan | null }>;
  generate(
    accountId: string,
    input: { requestKey: string; planId?: string; expectedVersion?: number },
  ): Promise<LearningPlan>;
  accept(
    accountId: string,
    id: string,
    expectedVersion: number,
  ): Promise<LearningPlan>;
  skip(
    accountId: string,
    id: string,
    activityId: string,
    expectedVersion: number,
  ): Promise<LearningPlan>;
  start(
    accountId: string,
    id: string,
    activityId: string,
    expectedVersion: number,
  ): Promise<{ plan: LearningPlan; sessionId: string | null }>;
}
export class PlanService {
  constructor(private readonly repo: PlanRepository) {}
  current(accountId: string) {
    return this.repo.current(accountId);
  }
  generate(
    accountId: string,
    input: { requestKey: string; planId?: string; expectedVersion?: number },
  ) {
    return this.repo.generate(accountId, input);
  }
  accept(accountId: string, id: string, version: number) {
    return this.repo.accept(accountId, id, version);
  }
  skip(accountId: string, id: string, activityId: string, version: number) {
    return this.repo.skip(accountId, id, activityId, version);
  }
  start(accountId: string, id: string, activityId: string, version: number) {
    return this.repo.start(accountId, id, activityId, version);
  }
}
