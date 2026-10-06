import { beforeEach, describe, expect, it } from 'vitest';
import { PostgresSessionRepository, sql } from '@fluentcoach/infrastructure';
import { ConversationService } from '@fluentcoach/application';
import { FakeConversationProvider } from '@fluentcoach/testing';
import { account, resetDatabase } from '../support/database.js';
beforeEach(resetDatabase);
describe('M03 PostgreSQL sessions', () => {
  it('persists every scenario/level snapshot independently of subsequent profile preferences', async () => {
    const a = await account('a'), service = new ConversationService(new PostgresSessionRepository(), new FakeConversationProvider());
    for (const scenario of service.scenarios()) for (const level of ['A1','A2','B1','B2'] as const) {
      const s = await service.start(a.id, {scenarioSlug: scenario.slug, level, mode: 'natural'});
      expect((await new PostgresSessionRepository().get(a.id, s.id))?.snapshot).toEqual({...s.snapshot, level, scenarioVersion: 1});
      await service.end(a.id,s.id); // Release one of the five M10 open-session slots.
    }
    await sql("UPDATE learner_profiles SET cefr_level='B2' WHERE account_id=$1", [a.id]);
    expect((await service.history(a.id)).filter(s => s.snapshot.level === 'A1')).toHaveLength(6);
  });
  it('orders deltas and deduplicates turns per session, replays only events after the cursor', async () => {
    const a = await account('a'), service = new ConversationService(new PostgresSessionRepository(), new FakeConversationProvider());
    const first = await service.start(a.id, {scenarioSlug: 'travel', level: 'A2', mode: 'natural'}), second = await service.start(a.id, {scenarioSlug: 'hotel', level: 'B1', mode: 'teaching'});
    await service.turn(a.id, first.id, 'same-key', 'Hello');
    await service.turn(a.id, first.id, 'same-key', 'ignored duplicate');
    await service.turn(a.id, second.id, 'same-key', 'Room please');
    expect((await service.history(a.id)).flatMap(s => s.turns)).toHaveLength(4);
    const all = await service.events(a.id, first.id);
    expect(all.map(e => e.sequence)).toEqual([1,2,3,4]);
    expect(all.map(e => e.kind)).toEqual(['tutor.delta','tutor.delta','tutor.delta','turn.completed']);
    expect(await service.events(a.id, first.id, 2)).toEqual(all.slice(2));
  });
  it('rejects a real second account for reads, streams, turn/help/end and forged repository writes', async () => {
    const a = await account('a'), b = await account('b'), repo = new PostgresSessionRepository(), service = new ConversationService(repo, new FakeConversationProvider());
    const s = await service.start(a.id, {scenarioSlug: 'hotel', level: 'B1', mode: 'teaching'});
    await service.turn(a.id, s.id, 'one', 'Hello');
    const original = await repo.get(a.id, s.id);
    expect(await repo.get(b.id, s.id)).toBeNull();
    expect(await service.history(b.id)).toEqual([]);
    for (const operation of [() => service.events(b.id, s.id), () => service.turn(b.id, s.id, 'two', 'Attack'), () => service.help(b.id, s.id), () => service.end(b.id, s.id), () => repo.save({...original!, accountId: b.id})]) await expect(operation()).rejects.toThrow('SESSION_NOT_FOUND');
    expect(await repo.get(a.id, s.id)).toEqual(original);
  });
  it('enforces ownership in database foreign keys even for direct adversarial SQL', async () => {
    const a = await account('a'), b = await account('b'), repo = new PostgresSessionRepository();
    const s = await repo.create(a.id, {scenarioSlug: 'hotel', scenarioVersion: 1, level: 'A2', mode: 'natural', promptVersion: 'v1'});
    await expect(sql("INSERT INTO practice_sessions(account_id,profile_id,scenario_slug,scenario_version,level,mode,prompt_version) VALUES($1,$2,'hotel',1,'A1','NATURAL','v1')", [b.id, a.profile])).rejects.toMatchObject({code: '23503'});
    await expect(sql("UPDATE practice_sessions SET profile_id=$1 WHERE id=$2", [b.profile, s.id])).rejects.toMatchObject({code: '23503'});
    await expect(sql("INSERT INTO conversation_turns(session_id,account_id,sequence,source_event_key,speaker,text,language) VALUES($1,$2,1,'x','learner','synthetic','en')", [s.id, b.id])).rejects.toMatchObject({code: '23503'});
    await expect(sql("INSERT INTO session_events(session_id,account_id,sequence,kind,payload) VALUES($1,$2,1,'tutor.delta','{}')", [s.id, b.id])).rejects.toMatchObject({code: '23503'});
  });
  it('rejects stale saves after end and preserves terminal evidence', async () => {
    const a = await account('a'), repo = new PostgresSessionRepository(), service = new ConversationService(repo, new FakeConversationProvider());
    const s = await service.start(a.id, {scenarioSlug: 'hotel', level: 'A1', mode: 'natural'});
    await service.turn(a.id, s.id, 'one', 'Hello');
    const stale = (await repo.get(a.id, s.id))!;
    await service.end(a.id, s.id);
    const frozen = await repo.get(a.id, s.id);
    stale.turns.push({sequence: 3, sourceEventKey: 'late', speaker: 'learner', text: 'Late', language: 'en'});
    await expect(repo.save(stale)).rejects.toThrow('SESSION_TERMINAL');
    await service.end(a.id, s.id);
    expect(await repo.get(a.id, s.id)).toEqual(frozen);
  });
});
