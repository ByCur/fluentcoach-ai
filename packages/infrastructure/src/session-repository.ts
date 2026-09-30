import type { SessionRecord, SessionRepository } from '@fluentcoach/application';
import type { ConversationTurn, SessionSnapshot } from '@fluentcoach/domain';
import { pool, sql } from './prisma.js';
type SessionRow = {id:string;account_id:string;scenario_slug:string;scenario_version:number;level:SessionSnapshot['level'];mode:'NATURAL'|'TEACHING';prompt_version:string;state:'CREATED'|'ACTIVE'|'ENDED'|'ABANDONED'|'FAILED'};
const states = {CREATED:'created',ACTIVE:'active',ENDED:'ended',ABANDONED:'abandoned',FAILED:'failed'} as const;
async function hydrate(row: SessionRow): Promise<SessionRecord> {
  const turns = await sql<ConversationTurn>('SELECT sequence,source_event_key AS "sourceEventKey",speaker,text,language FROM conversation_turns WHERE account_id=$1 AND session_id=$2 ORDER BY sequence',[row.account_id,row.id]);
  const events = await sql<{sequence:number;kind:string;payload:unknown}>('SELECT sequence,kind,payload FROM session_events WHERE account_id=$1 AND session_id=$2 ORDER BY sequence',[row.account_id,row.id]);
  return {id:row.id,accountId:row.account_id,snapshot:{scenarioSlug:row.scenario_slug,scenarioVersion:row.scenario_version,level:row.level,mode:row.mode.toLowerCase() as SessionSnapshot['mode'],promptVersion:row.prompt_version},state:states[row.state],turns,events};
}
export class PostgresSessionRepository implements SessionRepository {
  async create(accountId:string,s:SessionSnapshot) {
    const rows = await sql<SessionRow>('INSERT INTO practice_sessions(account_id,profile_id,scenario_slug,scenario_version,level,mode,prompt_version) SELECT $1,id,$2,$3,$4,$5,$6 FROM learner_profiles WHERE account_id=$1 RETURNING *',[accountId,s.scenarioSlug,s.scenarioVersion,s.level,s.mode.toUpperCase(),s.promptVersion]);
    if (!rows[0]) throw new Error('PROFILE_REQUIRED');
    return hydrate(rows[0]);
  }
  async get(accountId:string,id:string) {
    const row = (await sql<SessionRow>('SELECT * FROM practice_sessions WHERE account_id=$1 AND id=$2',[accountId,id]))[0];
    return row ? hydrate(row) : null;
  }
  async save(r:SessionRecord) {
    const c=await pool.connect();
    try {
      await c.query('BEGIN');
      const locked=(await c.query<{state:string}>('SELECT state FROM practice_sessions WHERE account_id=$1 AND id=$2 FOR UPDATE',[r.accountId,r.id])).rows[0];
      if (!locked) throw new Error('SESSION_NOT_FOUND');
      if (['ENDED','ABANDONED','FAILED'].includes(locked.state)) throw new Error('SESSION_TERMINAL');
      await c.query('UPDATE practice_sessions SET state=$3::"SessionState",ended_at=CASE WHEN $3::"SessionState"=$4::"SessionState" THEN COALESCE(ended_at,now()) ELSE ended_at END WHERE account_id=$1 AND id=$2',[r.accountId,r.id,r.state.toUpperCase(),'ENDED']);
      for (const t of r.turns) {
        const inserted = await c.query(`INSERT INTO conversation_turns(session_id,account_id,sequence,source_event_key,speaker,text,language) VALUES($1,$2,$3,$4,$5,$6,$7)
          ON CONFLICT(session_id,source_event_key) DO UPDATE SET source_event_key=EXCLUDED.source_event_key
          WHERE conversation_turns.sequence=EXCLUDED.sequence AND conversation_turns.text=EXCLUDED.text AND conversation_turns.speaker=EXCLUDED.speaker AND conversation_turns.language=EXCLUDED.language RETURNING id`,[r.id,r.accountId,t.sequence,t.sourceEventKey,t.speaker,t.text,t.language]);
        if (!inserted.rowCount) throw new Error('TURN_CONFLICT');
      }
      for (const e of r.events) {
        const inserted = await c.query(`INSERT INTO session_events(session_id,account_id,sequence,kind,payload) VALUES($1,$2,$3,$4,$5)
          ON CONFLICT(session_id,sequence) DO UPDATE SET sequence=EXCLUDED.sequence WHERE session_events.kind=EXCLUDED.kind AND session_events.payload=EXCLUDED.payload RETURNING id`,[r.id,r.accountId,e.sequence,e.kind,e.payload]);
        if (!inserted.rowCount) throw new Error('EVENT_CONFLICT');
      }
      await c.query('COMMIT');
    } catch (error) { await c.query('ROLLBACK'); throw error; }
    finally { c.release(); }
  }
  async history(accountId:string) {
    const rows = await sql<SessionRow>('SELECT * FROM practice_sessions WHERE account_id=$1 ORDER BY created_at DESC',[accountId]);
    return Promise.all(rows.map(hydrate));
  }
}
