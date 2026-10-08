import {randomUUID} from 'node:crypto';
import {pool} from '@fluentcoach/infrastructure';

/** Select a real persisted UUID for deterministic browser/integration branches. Empty fixture only. */
export async function setSessionInitiator(sessionId: string, initiator: 'learner'|'tutor') {
  const id = randomUUID().slice(0, -1) + (initiator === 'tutor' ? '0' : '1');
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const row = (await c.query<{account_id: string}>('SELECT account_id FROM practice_sessions WHERE id=$1', [sessionId])).rows[0]!;
    await c.query('SELECT id FROM accounts WHERE id=$1 FOR UPDATE', [row.account_id]);
    const links = (await c.query<{id: string}>('UPDATE learning_plan_activities SET session_id=NULL WHERE session_id=$1 AND account_id=$2 RETURNING id', [sessionId, row.account_id])).rows;
    await c.query("UPDATE practice_sessions s SET id=$2 WHERE s.id=$1 AND s.account_id=$3 AND s.state='CREATED' AND NOT EXISTS(SELECT 1 FROM conversation_turns t WHERE t.session_id=s.id)", [sessionId, id, row.account_id]);
    for (const link of links) await c.query('UPDATE learning_plan_activities SET session_id=$2 WHERE id=$1 AND account_id=$3', [link.id, id, row.account_id]);
    await c.query('COMMIT');
    return id;
  } catch (error) {await c.query('ROLLBACK'); throw error;} finally {c.release();}
}
