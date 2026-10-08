import type { PoolClient } from 'pg';
import {
  TUTOR_PROMPT_VERSION,
  DeterministicPlanGenerator,
  PLAN_SCHEMA_VERSION,
  PLAN_GENERATOR_VERSION,
  PLAN_CATALOG_VERSION,
  planCandidates,
  selectRoadmapCandidates,
  validatePlanSelection,
  validateReport,
  type PlanGenerator,
  type PlanInputs,
  type LearningPlan,
  type PlanActivity,
  type PlanCandidate,
  type PlanRepository,
  type ProgressRepository,
  type AnalysisTranscript,
} from '@fluentcoach/application';
import {
  recurringIssues,
  ISSUE_TAXONOMY_VERSION,
  progressMetrics,
  SCENARIOS,
  type ProgressEvent,
} from '@fluentcoach/domain';
import { pool } from './prisma.js';
import { rebuildIssueObservations } from './issue-repository.js';

export async function m09Transaction<T>(
  accountId: string,
  fn: (c: PoolClient) => Promise<T>,
): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    if (
      !(
        await c.query(
          "SELECT id FROM accounts WHERE id=$1 AND status='ACTIVE' FOR UPDATE",
          [accountId],
        )
      ).rowCount
    )
      throw Error('PLAN_NOT_FOUND');
    const result = await fn(c);
    await c.query('COMMIT');
    return result;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}
async function inputs(
  c: PoolClient,
  accountId: string,
): Promise<PlanInputs & { timezone: string; now: Date }> {
  const profile = (
    await c.query<{
      cefr_level: PlanInputs['level'];
      version: number;
      interests: string[];
      timezone: string;
    }>(
      'SELECT cefr_level,version,timezone,interests FROM learner_profiles WHERE account_id=$1',
      [accountId],
    )
  ).rows[0];
  if (!profile) throw Error('PROFILE_REQUIRED');
  const goal = (
    await c.query<{
      minutes_per_day: number;
      days_per_week: number;
      version: number;
    }>('SELECT * FROM practice_goals WHERE account_id=$1', [accountId])
  ).rows[0];
  const now = (await c.query<{ now: Date }>('SELECT clock_timestamp() now'))
    .rows[0]!.now;
  const observations = await rebuildIssueObservations(c, accountId);
  const dismissed = (
    await c.query<{ issue_key: string }>(
      'SELECT issue_key FROM issue_dismissals WHERE account_id=$1 AND taxonomy_version=$2 AND restored_at IS NULL',
      [accountId, ISSUE_TAXONOMY_VERSION],
    )
  ).rows;
  const issues = recurringIssues(
    observations,
    new Set(dismissed.map((r) => r.issue_key)),
    now,
  ).filter((i) => !i.dismissed);
  const cards = (
    await c.query<{
      id: string;
      source_report_id: string;
      source_revision: number;
    }>(
      "SELECT id,source_report_id,source_revision FROM vocabulary_cards WHERE account_id=$1 AND state='active' AND source_available AND due_at<=$2 ORDER BY due_at,id",
      [accountId, now],
    )
  ).rows;
  const reports = (
    await c.query<{
      id: string;
      content: unknown;
      session_id: string;
      transcript_revision: number;
      turns: AnalysisTranscript['turns'];
      partial: boolean;
      scenario_slug: string;
      scenario_version: number;
      level: PlanInputs['level'];
      mode: string;
      prompt_version: string;
    }>(
      `SELECT r.*,t.turns,s.scenario_slug,s.scenario_version,s.level,s.mode,s.prompt_version FROM session_reports r JOIN practice_sessions s ON s.id=r.session_id AND s.account_id=r.account_id AND s.transcript_revision=r.transcript_revision JOIN transcript_revisions t ON t.session_id=r.session_id AND t.account_id=r.account_id AND t.revision=r.transcript_revision JOIN analysis_runs a ON a.id=r.analysis_run_id AND a.account_id=r.account_id AND a.status='SUCCEEDED' WHERE r.account_id=$1`,
      [accountId],
    )
  ).rows;
  const validReports = new Map<string, number>();
  for (const r of reports) {
    try {
      validateReport(r.content, {
        accountId,
        sessionId: r.session_id,
        revision: r.transcript_revision,
        turns: r.turns,
        partial: r.partial,
        synthetic: false,
        snapshot: {
          scenarioSlug: r.scenario_slug,
          scenarioVersion: r.scenario_version,
          level: r.level,
          mode: r.mode.toLowerCase() as 'natural' | 'teaching',
          promptVersion: r.prompt_version,
        },
      });
      validReports.set(r.id, r.transcript_revision);
    } catch {
      /* Fail closed for invalid current report evidence. */
    }
  }
  const recent = (
    await c.query<{ scenario_slug: string }>(
      "SELECT scenario_slug FROM practice_sessions WHERE account_id=$1 AND state='ENDED' ORDER BY ended_at DESC NULLS LAST,id LIMIT 10",
      [accountId],
    )
  ).rows;
  return {
    level: profile.cefr_level,
    profileVersion: profile.version,
    interests: profile.interests,
    timezone: profile.timezone,
    now,
    goal: {
      minutesPerDay: goal?.minutes_per_day ?? 10,
      daysPerWeek: goal?.days_per_week ?? 3,
      version: goal?.version ?? 0,
    },
    issues,
    dueCardIds: cards
      .filter(
        (card) =>
          validReports.get(card.source_report_id) === card.source_revision,
      )
      .map((card) => card.id),
    recentScenarioSlugs: recent.map((r) => r.scenario_slug),
  };
}
type PlanRow = {
  id: string;
  schema_version: string;
  generator_version: string;
  catalog_version: string;
  version: number;
  state: LearningPlan['state'];
  created_at: Date;
  accepted_at: Date | null;
  accepted_from_version: number | null;
  source_snapshot: PlanInputs;
  rationale: string;
  insufficient_data: boolean;
  roadmap_signature: string | null;
  adapted_at: Date | null;
};
type ActivityRow = {
  id: string;
  definition: PlanCandidate;
  state: PlanActivity['state'];
  started_at: Date | null;
  session_id: string | null;
  skipped_from_version: number | null;
  started_from_version: number | null;
};
function isAvailable(activity: PlanCandidate, snapshot: PlanInputs): boolean {
  if (activity.type === 'conversation')
    return SCENARIOS.some((s) => s.slug === activity.scenarioSlug);
  if (activity.type === 'recurring-issue-practice') {
    const current = snapshot.issues.find(
      (i) =>
        i.taxonomyVersion === activity.taxonomyVersion &&
        i.issueKey === activity.issueKey &&
        !i.dismissed,
    );
    return (
      !!current &&
      !!activity.evidence?.length &&
      activity.evidence.every((e) =>
        current.evidence.some(
          (v) =>
            v.reportId === e.reportId &&
            v.analysisRunId === e.analysisRunId &&
            v.revision === e.revision &&
            v.sessionId === e.sessionId &&
            v.evidence.turnSequence === e.evidence.turnSequence &&
            v.evidence.start === e.evidence.start &&
            v.evidence.end === e.evidence.end &&
            v.evidence.quote === e.evidence.quote,
        ),
      )
    );
  }
  return (
    activity.type === 'vocabulary-review' &&
    !!activity.cardIds?.length &&
    activity.cardIds.every((id) => snapshot.dueCardIds.includes(id))
  );
}
async function hydrate(
  c: PoolClient,
  accountId: string,
  id: string,
  snapshot: PlanInputs,
): Promise<LearningPlan> {
  const r = (
    await c.query<PlanRow>(
      'SELECT * FROM learning_plans WHERE id=$1 AND account_id=$2',
      [id, accountId],
    )
  ).rows[0];
  if (!r) throw Error('PLAN_NOT_FOUND');
  const rows = (
    await c.query<ActivityRow>(
      'SELECT * FROM learning_plan_activities WHERE plan_id=$1 AND account_id=$2 ORDER BY position,candidate_id',
      [id, accountId],
    )
  ).rows;
  const activities: PlanActivity[] = [];
  for (const a of rows) {
    let completed = false;
    // Rebuild from the start timestamp even when a partial review made cards no longer due.
    if (a.started_at && a.state !== 'skipped') {
      if (a.definition.type === 'vocabulary-review') {
        completed =
          (
            await c.query<{ count: number }>(
              'SELECT COUNT(DISTINCT card_id)::int count FROM vocabulary_review_events WHERE account_id=$1 AND card_id=ANY($2::uuid[]) AND reviewed_at>=$3',
              [accountId, a.definition.cardIds, a.started_at],
            )
          ).rows[0]!.count >= (a.definition.targetCount ?? Infinity);
      } else {
        completed =
          !!a.session_id &&
          !!(
            await c.query(
              "SELECT 1 FROM practice_sessions s WHERE s.id=$1 AND s.account_id=$2 AND s.state='ENDED' AND EXISTS(SELECT 1 FROM practice_events p WHERE p.session_id=s.id AND p.account_id=s.account_id AND p.kind IN ('voice','text'))",
              [a.session_id, accountId],
            )
          ).rowCount;
      }
    }
    let reviewAvailable = false;
    if (a.started_at && a.definition.type === 'vocabulary-review') {
      const reviewed = (await c.query<{card_id: string}>(
        'SELECT DISTINCT card_id FROM vocabulary_review_events WHERE account_id=$1 AND card_id=ANY($2::uuid[]) AND reviewed_at>=$3',
        [accountId, a.definition.cardIds, a.started_at],
      )).rows.map(r => r.card_id);
      reviewAvailable = !!a.definition.cardIds?.length && a.definition.cardIds.every(id => snapshot.dueCardIds.includes(id) || reviewed.includes(id));
    }
    const sessionAvailable = !a.started_at || a.definition.type === 'vocabulary-review' || completed || !!(a.session_id && (await c.query(
      "SELECT 1 FROM practice_sessions WHERE id=$1 AND account_id=$2 AND state IN ('CREATED','ACTIVE')",
      [a.session_id, accountId],
    )).rowCount);
    const sourceAvailable = isAvailable(a.definition, snapshot) || reviewAvailable;
    const continuingRoadmapSession = r.roadmap_signature !== null && !!a.started_at && a.definition.type !== 'vocabulary-review' && sessionAvailable;
    const available =
      (sourceAvailable || continuingRoadmapSession) && sessionAvailable &&
      !(
        a.started_at &&
        a.definition.type !== 'vocabulary-review' &&
        !a.session_id
      );
    const state =
      a.state === 'skipped'
        ? 'skipped'
        : completed || (r.roadmap_signature !== null && a.state === 'completed')
          ? 'completed'
          : !available
            ? 'unavailable'
            : a.started_at
              ? 'started'
              : 'pending';
    // Rebuild deterministically, without changing optimistic mutation version for a read.
    if (state !== a.state)
      await c.query(
        'UPDATE learning_plan_activities SET state=$3 WHERE id=$1 AND account_id=$2',
        [a.id, accountId, state],
      );
    const definition = sourceAvailable
      ? a.definition
      : {
          ...a.definition,
          evidence: [],
          cardIds: [],
          rationale:
            'Esta práctica ya no necesita el ejemplo anterior. Tu ruta tendrá en cuenta lo que estás trabajando ahora.',
        };
    activities.push({
      ...definition,
      id: a.id,
      state,
      startedAt: a.started_at?.toISOString() ?? null,
      sessionId: a.session_id,
    });
  }
  // Current evidence is returned via activities, not a stale copy in the input audit snapshot.
  const sourceSnapshot = { ...r.source_snapshot, issues: [], dueCardIds: [] };
  return {
    id: r.id,
    schemaVersion: r.schema_version,
    generatorVersion: r.generator_version,
    catalogVersion: r.catalog_version,
    version: r.version,
    state: r.state,
    createdAt: r.created_at.toISOString(),
    acceptedAt: r.accepted_at?.toISOString() ?? null,
    sourceSnapshot,
    rationale: r.rationale,
    insufficientData: r.insufficient_data,
    adaptedAt: r.adapted_at?.toISOString() ?? null,
    activities,
  };
}
async function required(
  c: PoolClient,
  accountId: string,
  id: string,
): Promise<PlanRow> {
  const r = (
    await c.query<PlanRow>(
      'SELECT * FROM learning_plans WHERE id=$1 AND account_id=$2',
      [id, accountId],
    )
  ).rows[0];
  if (!r) throw Error('PLAN_NOT_FOUND');
  return r;
}
function currentVersion(r: PlanRow, version: number) {
  if (r.version !== version || !['active', 'proposal'].includes(r.state))
    throw Error('STALE_PLAN_VERSION');
}
function roadmapSignature(snapshot: PlanInputs): string {
  return JSON.stringify([snapshot.profileVersion, snapshot.goal.version, snapshot.interests,
    snapshot.recentScenarioSlugs, planCandidates(snapshot)]);
}
export class PostgresPlanRepository implements PlanRepository {
  constructor(
    private readonly generator: PlanGenerator = new DeterministicPlanGenerator(),
  ) {}
  async roadmap(accountId: string): Promise<LearningPlan> {
    // Snapshot and provider work are separated so account deletion never waits for inference.
    const prepared = await m09Transaction(accountId, async c => {
      const snapshot = await inputs(c, accountId);
      const row = (await c.query<PlanRow>(
        "SELECT * FROM learning_plans WHERE account_id=$1 AND state='active'", [accountId],
      )).rows[0];
      const signature = roadmapSignature(snapshot);
      const plan = row ? await hydrate(c, accountId, row.id, snapshot) : null;
      return { snapshot, signature, plan, unchanged: row?.roadmap_signature === signature && !plan?.activities.some(a => a.state === 'unavailable'),
        epoch: (await c.query<{deletion_epoch:number}>('SELECT deletion_epoch FROM accounts WHERE id=$1', [accountId])).rows[0]!.deletion_epoch };
    });
    if (prepared.unchanged && prepared.plan) return prepared.plan;
    let preferred = await selectRoadmapCandidates(this.generator, prepared.snapshot);
    return m09Transaction(accountId, async c => {
      const epoch = (await c.query<{deletion_epoch:number}>('SELECT deletion_epoch FROM accounts WHERE id=$1', [accountId])).rows[0]!.deletion_epoch;
      if (epoch !== prepared.epoch) throw Error('ACCOUNT_DELETING');
      const snapshot = await inputs(c, accountId), signature = roadmapSignature(snapshot);
      let row = (await c.query<PlanRow>(
        "SELECT * FROM learning_plans WHERE account_id=$1 AND state='active'", [accountId],
      )).rows[0];
      let plan = row ? await hydrate(c, accountId, row.id, snapshot) : null;
      if (row?.roadmap_signature === signature && plan && !plan.activities.some(a => a.state === 'unavailable')) return plan;
      // Concurrent evidence/profile edits are resolved from fresh server candidates, never stale model references.
      const fresh = planCandidates(snapshot);
      if (signature !== prepared.signature) preferred = fresh.slice(0, 4);
      const ordered = [
        ...fresh.filter(a => a.type !== 'conversation'),
        ...preferred.filter(a => a.type === 'conversation').map(a => fresh.find(f => f.candidateId === a.candidateId)!).filter(Boolean),
        ...fresh.filter(a => a.type === 'conversation'),
      ].filter((a, index, all) => all.findIndex(b => b.candidateId === a.candidateId) === index);
      // A provider cannot force a recently completed topic ahead of an unpractised topic.
      ordered.sort((a,b) => Number(a.type === 'conversation' && snapshot.recentScenarioSlugs.includes(a.scenarioSlug!)) - Number(b.type === 'conversation' && snapshot.recentScenarioSlugs.includes(b.scenarioSlug!)));
      if (!row) {
        // Adopt an eligible existing proposal for compatibility, or create the learner's first route atomically.
        row = (await c.query<PlanRow>("SELECT * FROM learning_plans WHERE account_id=$1 AND state='proposal'", [accountId])).rows[0];
        if (!row) row = (await c.query<PlanRow>(
          `INSERT INTO learning_plans(account_id,schema_version,generator_version,catalog_version,source_snapshot,rationale,insufficient_data) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          [accountId, PLAN_SCHEMA_VERSION, PLAN_GENERATOR_VERSION, PLAN_CATALOG_VERSION, snapshot, 'Tu ruta se basa en tu nivel, tus intereses y tu ritmo de práctica.', !snapshot.issues.length && !snapshot.dueCardIds.length],
        )).rows[0]!;
        await c.query("UPDATE learning_plans SET state='active',accepted_at=clock_timestamp(),accepted_from_version=version WHERE id=$1 AND account_id=$2", [row.id, accountId]);
        plan = await hydrate(c, accountId, row.id, snapshot);
      }
      const history = plan!.activities.filter(a => a.state === 'completed' || a.state === 'started');
      let upcoming = ordered.filter(candidate => !history.some(activity => {
        if (activity.candidateId !== candidate.candidateId) return false;
        if (activity.state === 'started' || candidate.type === 'conversation') return true;
        if (candidate.type === 'vocabulary-review') return false; // Newly due cards can be reviewed again.
        return JSON.stringify(activity.evidence) === JSON.stringify(candidate.evidence);
      }));
      // Finishing the full topic cycle opens a fresh cycle while retaining completed steps.
      if (!upcoming.length && !history.some(a => a.state === 'started')) upcoming = ordered.filter(a => a.type === 'conversation');
      await c.query("DELETE FROM learning_plan_activities WHERE plan_id=$1 AND account_id=$2 AND NOT (id=ANY($3::uuid[]))", [row.id, accountId, history.map(a => a.id)]);
      for (const [position, activity] of history.entries())
        await c.query('UPDATE learning_plan_activities SET position=$3 WHERE id=$1 AND account_id=$2', [activity.id, accountId, position]);
      for (const [index, activity] of upcoming.entries())
        await c.query(
          'INSERT INTO learning_plan_activities(account_id,plan_id,catalog_version,candidate_id,activity_type,definition,position) VALUES($1,$2,$3,$4,$5,$6,$7)',
          [accountId, row.id, PLAN_CATALOG_VERSION, `${activity.candidateId}@${row.version + 1}`, activity.type, activity, history.length + index],
        );
      await c.query(
        `UPDATE learning_plans SET roadmap_signature=$3,source_snapshot=$4,version=version+1,rationale=$5,generator_version=$6,catalog_version=$7,
         adapted_at=CASE WHEN roadmap_signature IS NOT NULL THEN clock_timestamp() ELSE adapted_at END WHERE id=$1 AND account_id=$2`,
        [row.id, accountId, signature, snapshot, 'Tu ruta se basa en tu nivel, tus intereses y tu ritmo de práctica.', PLAN_GENERATOR_VERSION, PLAN_CATALOG_VERSION],
      );
      return hydrate(c, accountId, row.id, snapshot);
    });
  }
  current(accountId: string) {
    return m09Transaction(accountId, async (c) => {
      const snapshot = await inputs(c, accountId);
      const rows = (
        await c.query<{ id: string; state: 'active' | 'proposal' }>(
          "SELECT id,state FROM learning_plans WHERE account_id=$1 AND state IN ('active','proposal')",
          [accountId],
        )
      ).rows;
      const result: {
        active: LearningPlan | null;
        proposal: LearningPlan | null;
      } = { active: null, proposal: null };
      for (const row of rows)
        result[row.state] = await hydrate(c, accountId, row.id, snapshot);
      return result;
    });
  }
  async generate(
    accountId: string,
    input: { requestKey: string; planId?: string; expectedVersion?: number },
  ) {
    // Provider execution holds no account lock: deletion can revoke immediately.
    const prepared=await m09Transaction(accountId,async c=>({snapshot:await inputs(c,accountId),epoch:(await c.query<{deletion_epoch:number}>('SELECT deletion_epoch FROM accounts WHERE id=$1',[accountId])).rows[0]!.deletion_epoch}));
    let selection:unknown;
    try {selection=await this.generator.select(structuredClone(planCandidates(prepared.snapshot)));}catch{throw Error('PLAN_GENERATION_RETRYABLE');}
    return m09Transaction(accountId, async (c) => {
      const epoch=(await c.query<{deletion_epoch:number}>('SELECT deletion_epoch FROM accounts WHERE id=$1',[accountId])).rows[0]!.deletion_epoch;
      if(epoch!==prepared.epoch)throw Error('PLAN_GENERATION_RETRYABLE');
      if (input.planId) await required(c, accountId, input.planId);
      const snapshot = await inputs(c, accountId);
      if(snapshot.profileVersion!==prepared.snapshot.profileVersion || snapshot.goal.version!==prepared.snapshot.goal.version)throw Error('PLAN_GENERATION_RETRYABLE');
      const signature = JSON.stringify([
          input.planId ?? null,
          input.expectedVersion ?? null,
        ]);
      const receipt = (
        await c.query<{ plan_id: string; signature: string }>(
          'SELECT * FROM learning_plan_requests WHERE account_id=$1 AND request_key=$2',
          [accountId, input.requestKey],
        )
      ).rows[0];
      if (receipt) {
        if (receipt.signature !== signature)
          throw Error('IDEMPOTENCY_CONFLICT');
        const r = await required(c, accountId, receipt.plan_id);
        if (!['active', 'proposal'].includes(r.state))
          throw Error('STALE_PLAN_VERSION');
        return hydrate(c, accountId, r.id, snapshot);
      }
      if (input.planId) {
        const previous = await required(c, accountId, input.planId);
        currentVersion(previous, input.expectedVersion!);
      }
      let proposal = (
        await c.query<{ id: string }>(
          "SELECT id FROM learning_plans WHERE account_id=$1 AND state='proposal'",
          [accountId],
        )
      ).rows[0];
      // Refreshing an active plan returns its current proposal, even for concurrent distinct keys.
      // Refreshing the proposal itself explicitly replaces it.
      if (proposal && input.planId === proposal.id) {
        await c.query(
          "UPDATE learning_plans SET state='replaced',version=version+1 WHERE id=$1 AND account_id=$2",
          [proposal.id, accountId],
        );
        proposal = undefined;
      }
      let id = proposal?.id;
      if (!id) {
        const candidates = planCandidates(snapshot);
        let selected: PlanCandidate[];
        try {
          selected = validatePlanSelection(
            selection,
            candidates,
          );
        } catch {
          throw Error('PLAN_GENERATION_RETRYABLE');
        }
        // Rebuild after generation; every reference must still be eligible and owned.
        const after = await inputs(c, accountId);
        if (
          after.profileVersion !== snapshot.profileVersion ||
          after.goal.version !== snapshot.goal.version ||
          selected.some((a) => !isAvailable(a, after))
        )
          throw Error('PLAN_GENERATION_RETRYABLE');
        const insufficientData =
          !snapshot.issues.length && !snapshot.dueCardIds.length;
        const rationale = insufficientData
          ? 'Aún no hay suficientes datos para personalizar tus prioridades. Este plan se basa en tu nivel y tu objetivo de práctica.'
          : 'Prioridades basadas en observaciones actuales y expresiones pendientes; no son una evaluación de nivel.';
        id = (
          await c.query<{ id: string }>(
            `INSERT INTO learning_plans(account_id,schema_version,generator_version,catalog_version,source_snapshot,rationale,insufficient_data) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
            [
              accountId,
              PLAN_SCHEMA_VERSION,
              PLAN_GENERATOR_VERSION,
              PLAN_CATALOG_VERSION,
              snapshot,
              rationale,
              insufficientData,
            ],
          )
        ).rows[0]!.id;
        for (const [position, a] of selected.entries())
          await c.query(
            'INSERT INTO learning_plan_activities(account_id,plan_id,catalog_version,candidate_id,activity_type,definition,position) VALUES($1,$2,$3,$4,$5,$6,$7)',
            [accountId, id, PLAN_CATALOG_VERSION, a.candidateId, a.type, a, position],
          );
      }
      await c.query(
        'INSERT INTO learning_plan_requests(account_id,request_key,plan_id,signature) VALUES($1,$2,$3,$4)',
        [accountId, input.requestKey, id, signature],
      );
      return hydrate(c, accountId, id, snapshot);
    });
  }
  accept(accountId: string, id: string, expectedVersion: number) {
    return m09Transaction(accountId, async (c) => {
      const r = await required(c, accountId, id),
        snapshot = await inputs(c, accountId);
      if (r.state === 'active' && r.accepted_from_version === expectedVersion)
        return hydrate(c, accountId, id, snapshot);
      currentVersion(r, expectedVersion);
      if (r.state !== 'proposal') throw Error('STALE_PLAN_VERSION');
      const plan = await hydrate(c, accountId, id, snapshot);
      if (
        r.source_snapshot.profileVersion !== snapshot.profileVersion ||
        r.source_snapshot.goal.version !== snapshot.goal.version ||
        plan.activities.some((a) => a.state === 'unavailable')
      )
        throw Error('PLAN_SOURCES_CHANGED');
      await c.query(
        "UPDATE learning_plans SET state='superseded',version=version+1 WHERE account_id=$1 AND state='active'",
        [accountId],
      );
      await c.query(
        "UPDATE learning_plans SET state='active',accepted_at=clock_timestamp(),accepted_from_version=version,version=version+1 WHERE id=$1 AND account_id=$2",
        [id, accountId],
      );
      return hydrate(c, accountId, id, snapshot);
    });
  }
  skip(
    accountId: string,
    id: string,
    activityId: string,
    expectedVersion: number,
  ) {
    return m09Transaction(accountId, async (c) => {
      const r = await required(c, accountId, id),
        snapshot = await inputs(c, accountId);
      const a = (
        await c.query<ActivityRow>(
          'SELECT * FROM learning_plan_activities WHERE id=$1 AND plan_id=$2 AND account_id=$3',
          [activityId, id, accountId],
        )
      ).rows[0];
      if (!a) throw Error('PLAN_NOT_FOUND');
      if (
        ['active', 'proposal'].includes(r.state) &&
        a.state === 'skipped' &&
        a.skipped_from_version === expectedVersion
      )
        return hydrate(c, accountId, id, snapshot);
      currentVersion(r, expectedVersion);
      if (!['pending', 'unavailable'].includes(a.state))
        throw Error('ACTIVITY_STATE_CONFLICT');
      await c.query(
        "UPDATE learning_plan_activities SET state='skipped',skipped_from_version=$3 WHERE id=$1 AND account_id=$2",
        [activityId, accountId, expectedVersion],
      );
      await c.query(
        'UPDATE learning_plans SET version=version+1 WHERE id=$1 AND account_id=$2',
        [id, accountId],
      );
      return hydrate(c, accountId, id, snapshot);
    });
  }
  start(
    accountId: string,
    id: string,
    activityId: string,
    expectedVersion: number,
  ) {
    return m09Transaction(accountId, async (c) => {
      const r = await required(c, accountId, id),
        snapshot = await inputs(c, accountId);
      if (r.state !== 'active') throw Error('ACTIVITY_STATE_CONFLICT');
      const receipt = (await c.query<ActivityRow>(
        'SELECT * FROM learning_plan_activities WHERE id=$1 AND plan_id=$2 AND account_id=$3',
        [activityId, id, accountId],
      )).rows[0];
      if (!receipt) throw Error('PLAN_NOT_FOUND');
      // A lost acknowledgement must replay the committed start before checking the new version.
      if (receipt.started_at && receipt.started_from_version === expectedVersion)
        return { plan: await hydrate(c, accountId, id, snapshot), sessionId: receipt.session_id };
      currentVersion(r, expectedVersion);
      const plan = await hydrate(c, accountId, id, snapshot),
        a = plan.activities.find((a) => a.id === activityId);
      if (!a) throw Error('PLAN_NOT_FOUND');
      if (a.state === 'started') return { plan, sessionId: a.sessionId };
      if (r.roadmap_signature !== null && plan.activities.find(a => ['pending', 'started'].includes(a.state))?.id !== activityId) throw Error('ACTIVITY_STATE_CONFLICT');
      if (a.state !== 'pending') throw Error('ACTIVITY_STATE_CONFLICT');
      let sessionId: string | null = null;
      if (a.type !== 'vocabulary-review') {
        // The account lock serializes cleanup with starts and transcript saves.
        // Keep every meaningful practice, live inference lease and active plan link.
        await c.query(
          `UPDATE practice_sessions s SET state='ABANDONED',ended_at=clock_timestamp()
           WHERE s.account_id=$1 AND s.state='CREATED'
           AND (s.turn_lease_until IS NULL OR s.turn_lease_until<=clock_timestamp())
           AND NOT EXISTS (SELECT 1 FROM conversation_turns t WHERE t.account_id=s.account_id AND t.session_id=s.id AND t.speaker IN ('learner','tutor'))
           AND NOT EXISTS (SELECT 1 FROM learning_plan_activities activity
             JOIN learning_plans p ON p.id=activity.plan_id AND p.account_id=activity.account_id
             WHERE activity.account_id=s.account_id AND activity.session_id=s.id
             AND activity.state='started' AND p.state='active')`,
          [accountId],
        );
        sessionId = (
          await c.query<{ id: string }>(
            `INSERT INTO practice_sessions(account_id,profile_id,scenario_slug,scenario_version,level,mode,prompt_version) SELECT $1,id,$2,$5,$3,$4,$6 FROM learner_profiles WHERE account_id=$1 RETURNING id`,
            [
              accountId,
              a.scenarioSlug,
              a.level,
              a.mode!.toUpperCase(),
              SCENARIOS.find((s) => s.slug === a.scenarioSlug)!.version,
              TUTOR_PROMPT_VERSION,
            ],
          )
        ).rows[0]!.id;
      }
      await c.query(
        "UPDATE learning_plan_activities SET state='started',started_at=clock_timestamp(),session_id=$3,started_from_version=$4 WHERE id=$1 AND account_id=$2",
        [activityId, accountId, sessionId, expectedVersion],
      );
      await c.query(
        'UPDATE learning_plans SET version=version+1 WHERE id=$1 AND account_id=$2',
        [id, accountId],
      );
      return { plan: await hydrate(c, accountId, id, snapshot), sessionId };
    });
  }
}
export class PostgresProgressRepository implements ProgressRepository {
  get(accountId: string) {
    return m09Transaction(accountId, async (c) => {
      const snapshot = await inputs(c, accountId);
      const events = (
        await c.query<{
          kind: ProgressEvent['kind'];
          duration_ms: number;
          local_date: string;
        }>(
          "SELECT p.kind,p.duration_ms,p.local_date::text FROM practice_events p JOIN practice_sessions s ON s.id=p.session_id AND s.account_id=p.account_id WHERE p.account_id=$1 AND (p.kind<>'session-completed' OR s.state='ENDED')",
          [accountId],
        )
      ).rows.map((r) => ({
        kind: r.kind,
        durationMs: r.duration_ms,
        localDate: r.local_date,
      }));
      const reviews = (
        await c.query<{ local_date: string }>(
          'SELECT local_date::text FROM vocabulary_review_events WHERE account_id=$1',
          [accountId],
        )
      ).rows.map((r) => ({ localDate: r.local_date }));
      // Due count uses M08 current learner-owned cards; plans apply the stronger evidence check.
      const due = (
        await c.query<{ count: number }>(
          "SELECT COUNT(*)::int count FROM vocabulary_cards WHERE account_id=$1 AND state='active' AND due_at<=$2",
          [accountId, snapshot.now],
        )
      ).rows[0]!.count;
      return progressMetrics(
        events,
        reviews,
        snapshot.now,
        snapshot.timezone,
        snapshot.goal,
        due,
      );
    });
  }
  issues(accountId: string) {
    return m09Transaction(accountId, async (c) => {
      const snapshot = await inputs(c, accountId);
      return snapshot.issues.map((issue) => ({
        issueKey: issue.issueKey,
        label: issue.label,
        observationCount: issue.observationCount,
        sessionCount: issue.sessionCount,
        evidence: issue.evidence,
        buckets: [1, 0].map((n) => {
          const end = new Date(snapshot.now.getTime() - n * 14 * 86400000),
            start = new Date(end.getTime() - 14 * 86400000);
          const evidence = issue.evidence.filter(
            (e) =>
              Date.parse(e.occurredAt) >= start.getTime() &&
              Date.parse(e.occurredAt) < end.getTime(),
          );
          return {
            startsAt: start.toISOString(),
            endsAt: end.toISOString(),
            observations: evidence.length,
            sessions: new Set(evidence.map((e) => e.sessionId)).size,
          };
        }),
        message:
          'Datos insuficientes para mostrar una tendencia. Las observaciones describen la evidencia disponible; no miden mejora ni nivel.',
      }));
    });
  }
}
