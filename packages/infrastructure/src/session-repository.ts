import {
  type SessionRecord,
  AiError,
  type SessionRepository,
  type ProviderMetadata,
} from '@fluentcoach/application';
import {
  boundedPracticeTelemetry,
  type PracticeTelemetry,
  type ConversationTurn,
  type SessionSnapshot,
} from '@fluentcoach/domain';
import { pool, sql } from './prisma.js';
type SessionRow = {
  id: string;
  account_id: string;
  scenario_slug: string;
  scenario_version: number;
  level: SessionSnapshot['level'];
  mode: 'NATURAL' | 'TEACHING';
  prompt_version: string;
  state: 'CREATED' | 'ACTIVE' | 'ENDED' | 'ABANDONED' | 'FAILED';
};
const states = {
  CREATED: 'created',
  ACTIVE: 'active',
  ENDED: 'ended',
  ABANDONED: 'abandoned',
  FAILED: 'failed',
} as const;
async function hydrate(row: SessionRow): Promise<SessionRecord> {
  const turns = await sql<ConversationTurn & { source_event_key: string }>(
    'SELECT sequence,source_event_key,speaker,text,language FROM conversation_turns WHERE account_id=$1 AND session_id=$2 ORDER BY sequence',
    [row.account_id, row.id],
  );
  const events = await sql<{
    sequence: number;
    kind: string;
    payload: unknown;
  }>(
    'SELECT sequence,kind,payload FROM session_events WHERE account_id=$1 AND session_id=$2 ORDER BY sequence',
    [row.account_id, row.id],
  );
  return {
    id: row.id,
    accountId: row.account_id,
    snapshot: {
      scenarioSlug: row.scenario_slug,
      scenarioVersion: row.scenario_version,
      level: row.level,
      mode: row.mode.toLowerCase() as SessionSnapshot['mode'],
      promptVersion: row.prompt_version,
    },
    state: states[row.state],
    turns: turns.map((t) => ({ ...t, sourceEventKey: t.source_event_key })),
    events,
  };
}
export class PostgresSessionRepository implements SessionRepository {
  async create(accountId: string, s: SessionSnapshot) {
    const rows = await sql<SessionRow>(
      'INSERT INTO practice_sessions(account_id,profile_id,scenario_slug,scenario_version,level,mode,prompt_version) SELECT $1,id,$2,$3,$4,$5,$6 FROM learner_profiles WHERE account_id=$1 RETURNING *',
      [
        accountId,
        s.scenarioSlug,
        s.scenarioVersion,
        s.level,
        s.mode.toUpperCase(),
        s.promptVersion,
      ],
    );
    if (!rows[0]) throw Error('PROFILE_REQUIRED');
    return hydrate(rows[0]);
  }
  async get(accountId: string, id: string) {
    const row = (
      await sql<SessionRow>(
        'SELECT * FROM practice_sessions WHERE account_id=$1 AND id=$2',
        [accountId, id],
      )
    )[0];
    return row ? hydrate(row) : null;
  }
  async save(
    r: SessionRecord,
    leaseToken?: string,
    practice?: PracticeTelemetry & { sourceEventKey: string },
  ) {
    if (practice)
      practice = {
        ...boundedPracticeTelemetry(practice),
        sourceEventKey: practice.sourceEventKey,
      };
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const current = (
        await c.query<{
          state: string;
          turn_lease_token: string | null;
          turn_lease_until: Date | null;
        }>(
          "SELECT s.state,s.turn_lease_token,s.turn_lease_until FROM practice_sessions s JOIN accounts a ON a.id=s.account_id WHERE s.account_id=$1 AND s.id=$2 AND a.status='ACTIVE' FOR UPDATE OF s,a",
          [r.accountId, r.id],
        )
      ).rows[0];
      if (!current) throw Error('SESSION_NOT_FOUND');
      if (
        leaseToken !== undefined &&
        (current.turn_lease_token !== leaseToken ||
          !current.turn_lease_until ||
          current.turn_lease_until.getTime() <= Date.now())
      )
        throw new AiError('cancelled');
      if (['ENDED', 'ABANDONED', 'FAILED'].includes(current.state))
        throw new Error('SESSION_TERMINAL');
      await c.query(
        'UPDATE practice_sessions SET state=$3::"SessionState",ended_at=CASE WHEN $3::"SessionState"=$4::"SessionState" THEN COALESCE(ended_at,now()) ELSE ended_at END WHERE account_id=$1 AND id=$2',
        [r.accountId, r.id, r.state.toUpperCase(), 'ENDED'],
      );
      for (const t of r.turns) {
        const inserted = await c.query(
          `INSERT INTO conversation_turns(session_id,account_id,sequence,source_event_key,speaker,text,language) VALUES($1,$2,$3,$4,$5,$6,$7)
          ON CONFLICT(session_id,source_event_key) DO UPDATE SET source_event_key=EXCLUDED.source_event_key
          WHERE conversation_turns.sequence=EXCLUDED.sequence AND conversation_turns.text=EXCLUDED.text AND conversation_turns.speaker=EXCLUDED.speaker AND conversation_turns.language=EXCLUDED.language RETURNING id`,
          [
            r.id,
            r.accountId,
            t.sequence,
            t.sourceEventKey,
            t.speaker,
            t.text,
            t.language,
          ],
        );
        if (!inserted.rowCount) throw new Error('TURN_CONFLICT');
      }
      for (const e of r.events) {
        const inserted = await c.query(
          `INSERT INTO session_events(session_id,account_id,sequence,kind,payload) VALUES($1,$2,$3,$4,$5)
          ON CONFLICT(session_id,sequence) DO UPDATE SET sequence=EXCLUDED.sequence WHERE session_events.kind=EXCLUDED.kind AND session_events.payload=EXCLUDED.payload RETURNING id`,
          [r.id, r.accountId, e.sequence, e.kind, e.payload],
        );
        if (!inserted.rowCount) throw new Error('EVENT_CONFLICT');
      }
      if (practice) {
        // Only accepted learner turns with committed successful replies can produce progress.
        const event = await c.query(
          `INSERT INTO practice_events(account_id,session_id,turn_id,source_key,kind,duration_ms,occurred_at,timezone_at_event,local_date)
          SELECT t.account_id,t.session_id,t.id,'turn:'||t.source_event_key,$4,$5,stamp.instant,p.timezone,(stamp.instant AT TIME ZONE p.timezone)::date
          FROM conversation_turns t JOIN learner_profiles p ON p.account_id=t.account_id
          CROSS JOIN (SELECT clock_timestamp() instant) stamp
          WHERE t.account_id=$1 AND t.session_id=$2 AND t.source_event_key=$3 AND t.speaker='learner'
          AND t.text !~* 'no entiendo|i don.t understand'
          AND EXISTS(SELECT 1 FROM conversation_turns reply WHERE reply.account_id=t.account_id AND reply.session_id=t.session_id AND reply.source_event_key=t.source_event_key||':reply' AND reply.speaker='tutor')
          ON CONFLICT(account_id,session_id,source_key) DO NOTHING RETURNING id`,
          [
            r.accountId,
            r.id,
            practice.sourceEventKey,
            practice.kind,
            practice.durationMs,
          ],
        );
        if (
          !event.rowCount &&
          !(
            await c.query(
              "SELECT 1 FROM practice_events WHERE account_id=$1 AND session_id=$2 AND source_key='turn:'||$3",
              [r.accountId, r.id, practice.sourceEventKey],
            )
          ).rowCount
        )
          throw Error('INVALID_PRACTICE_SOURCE');
      }
      await c.query('COMMIT');
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }
  async acquireTurn(accountId: string, sessionId: string, token: string) {
    const rows = await sql(
      `UPDATE practice_sessions s SET turn_lease_token=$3,turn_lease_until=now()+interval '30 seconds' FROM accounts a WHERE s.account_id=$1 AND s.id=$2 AND a.id=s.account_id AND a.status='ACTIVE' AND s.state IN ('CREATED','ACTIVE') AND (s.turn_lease_until IS NULL OR s.turn_lease_until<now()) RETURNING s.id`,
      [accountId, sessionId, token],
    );
    return rows.length === 1;
  }
  async releaseTurn(accountId: string, sessionId: string, token: string) {
    await sql(
      'UPDATE practice_sessions SET turn_lease_token=NULL,turn_lease_until=NULL WHERE account_id=$1 AND id=$2 AND turn_lease_token=$3',
      [accountId, sessionId, token],
    );
  }
  async recordProvider(
    accountId: string,
    sessionId: string,
    m: ProviderMetadata,
  ) {
    await sql(
      `INSERT INTO provider_runs(account_id,session_id,operation,adapter,model,prompt_version,schema_version,outcome,latency_ms,request_id,input_tokens,output_tokens,finish_reason)SELECT s.account_id,s.id,'conversation',$3,$4,$5,$6,'succeeded',$7,$8,$9,$10,$11 FROM practice_sessions s JOIN accounts a ON a.id=s.account_id WHERE s.id=$2 AND s.account_id=$1 AND a.status='ACTIVE'`,
      [
        accountId,
        sessionId,
        m.adapter,
        m.model,
        m.promptVersion,
        m.schemaVersion,
        m.latencyMs,
        m.requestId ?? null,
        m.inputTokens,
        m.outputTokens,
        m.finishReason,
      ],
    );
  }
  async history(accountId: string) {
    const rows = await sql<SessionRow>(
      'SELECT * FROM practice_sessions WHERE account_id=$1 ORDER BY created_at DESC',
      [accountId],
    );
    return Promise.all(rows.map(hydrate));
  }
}
