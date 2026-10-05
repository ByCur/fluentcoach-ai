import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ConversationService,
  VoiceTurnService,
  AiError,
  type ConversationProvider,
  type SpeechTranscriber,
} from '@fluentcoach/application';
import {
  PostgresSessionRepository,
  PostgresProgressRepository,
  PostgresVocabularyRepository,
  sql,
} from '@fluentcoach/infrastructure';
import { FakeConversationProvider } from '@fluentcoach/testing';
import { localDateAt, progressMetrics } from '@fluentcoach/domain';
import { account, resetDatabase } from '../support/database.js';
import { dueCard } from '../support/m09.js';
const repo = new PostgresSessionRepository(),
  progress = new PostgresProgressRepository();
const service = () =>
  new ConversationService(repo, new FakeConversationProvider());
const stt: SpeechTranscriber = {
  provider: 'fake',
  transcribe: () =>
    Promise.resolve({ transcript: 'I want a room', elapsedMs: 0 }),
};
const audio = (
  accountId: string,
  sessionId: string,
  key = randomUUID(),
  durationMs = 30000,
) => ({
  accountId,
  sessionId,
  sourceEventKey: key,
  audio: new Uint8Array([1, 2]),
  mimeType: 'audio/wav',
  filename: 'synthetic.wav',
  durationMs,
});
beforeEach(resetDatabase);
async function start(accountId: string, provider?: ConversationProvider) {
  const c = provider ? new ConversationService(repo, provider) : service();
  const s = await c.start(accountId, {
    scenarioSlug: 'hotel',
    level: 'A1',
    mode: 'natural',
  });
  return { c, s };
}
describe('M09 canonical progress and active practice', () => {
  it('separates successful voice from text, clamps telemetry, legacy is zero, and counts completed once', async () => {
    const a = await account('metrics'),
      { c, s } = await start(a.id),
      voice = new VoiceTurnService(c, stt);
    await voice.turn(audio(a.id, s.id));
    await c.turn(a.id, s.id, 'text', 'A written reply', {
      kind: 'text',
      durationMs: 60000,
    });
    await c.turn(a.id, s.id, 'legacy', 'A legacy reply');
    const before = await progress.get(a.id);
    expect(before).toMatchObject({
      speakingMinutes: 0.5,
      textMinutes: 1,
      activeMinutes: 1.5,
      completedSessions: 0,
    });
    await c.end(a.id, s.id);
    await c.end(a.id, s.id);
    expect(await progress.get(a.id)).toMatchObject({
      completedSessions: 1,
      speakingMinutes: 0.5,
      textMinutes: 1,
    });
  });
  it('deduplicates concurrent voice/text source identities and never adds idle or latency', async () => {
    const a = await account('duplicates'),
      { c, s } = await start(a.id),
      voice = new VoiceTurnService(c, stt),
      input = audio(a.id, s.id);
    await Promise.all([voice.turn(input), voice.turn(input)]);
    await voice.turn(input);
    await Promise.all([
      c.turn(a.id, s.id, 'text', 'hello', { kind: 'text', durationMs: 1000 }),
      c.turn(a.id, s.id, 'text', 'hello', { kind: 'text', durationMs: 1000 }),
    ]);
    await c.turn(a.id, s.id, 'text', 'hello', {
      kind: 'text',
      durationMs: 1000,
    });
    await sql(
      "UPDATE practice_sessions SET created_at=now()-interval '10 hours' WHERE id=$1",
      [s.id],
    );
    const result = await progress.get(a.id);
    expect(result.activeMinutes).toBe(31000 / 60000);
    expect(
      await sql(
        "SELECT * FROM practice_events WHERE account_id=$1 AND kind IN ('voice','text')",
        [a.id],
      ),
    ).toHaveLength(2);
  });
  it('rejects failed transcription, rejected audio, help and terminal attempts without progress', async () => {
    const a = await account('failed'),
      { c, s } = await start(a.id),
      voice = new VoiceTurnService(c, stt);
    await expect(
      voice.turn(audio(a.id, s.id, randomUUID(), 30001)),
    ).rejects.toThrow('AUDIO_DURATION_EXCEEDED');
    const failed = new VoiceTurnService(c, {
      provider: 'fake',
      transcribe: () => Promise.reject(new AiError('unavailable')),
    });
    await expect(failed.turn(audio(a.id, s.id))).rejects.toThrow();
    await c.turn(a.id, s.id, 'help', 'No entiendo', {
      kind: 'text',
      durationMs: 100000,
    });
    const helpVoice = new VoiceTurnService(c, {
      provider: 'fake',
      transcribe: () =>
        Promise.resolve({ ...awaitableResult(), transcript: 'No entiendo' }),
    });
    await helpVoice.turn(audio(a.id, s.id));
    expect((await progress.get(a.id)).activeMinutes).toBe(0);
    await c.end(a.id, s.id);
    await expect(voice.turn(audio(a.id, s.id))).rejects.toThrow(
      'SESSION_TERMINAL',
    );
    expect((await progress.get(a.id)).speakingMinutes).toBe(0);
  });
  it('failed tutor turn does not record accepted activity; retry succeeds once', async () => {
    const a = await account('failed-tutor');
    let fail = true;
    const provider: ConversationProvider = {
      stream(context, input, options) {
        if (fail) throw new AiError('unavailable');
        return new FakeConversationProvider().stream(context, input, options);
      },
    };
    const { c, s } = await start(a.id, provider);
    await expect(
      c.turn(a.id, s.id, 'retry', 'hello', {
        kind: 'voice',
        durationMs: 30000,
      }),
    ).rejects.toThrow();
    expect((await progress.get(a.id)).activeMinutes).toBe(0);
    fail = false;
    await c.turn(a.id, s.id, 'retry', 'hello', {
      kind: 'voice',
      durationMs: 30000,
    });
    expect((await progress.get(a.id)).speakingMinutes).toBe(0.5);
  });
  it('abandoned/failed sessions never inflate completed sessions', async () => {
    const a = await account('terminal');
    for (const state of ['ABANDONED', 'FAILED']) {
      const { s } = await start(a.id);
      await sql(
        'UPDATE practice_sessions SET state=$2::"SessionState" WHERE id=$1',
        [s.id, state],
      );
    }
    expect((await progress.get(a.id)).completedSessions).toBe(0);
  });
  it('snapshots profile timezone at voice/text/review/completion commits and preserves it after change', async () => {
    const a = await account('timezone');
    await sql(
      "UPDATE learner_profiles SET timezone='Europe/Madrid' WHERE account_id=$1",
      [a.id],
    );
    const { c, s } = await start(a.id);
    await c.turn(a.id, s.id, 'timezone', 'hello', {
      kind: 'text',
      durationMs: 1000,
    });
    await c.end(a.id, s.id);
    const card = await dueCard(a.id);
    await new PostgresVocabularyRepository().review(a.id, card.id, {
      rating: 'good',
      reviewKey: randomUUID(),
      expectedVersion: 1,
    });
    const events = await sql<{
      timezone_at_event: string;
      local_date: string;
      occurred_at: Date;
    }>(
      'SELECT timezone_at_event,local_date::text,occurred_at FROM practice_events WHERE account_id=$1',
      [a.id],
    );
    for (const e of events) {
      expect(e.timezone_at_event).toBe('Europe/Madrid');
      expect(e.local_date).toBe(localDateAt(e.occurred_at, 'Europe/Madrid'));
    }
    const reviews = await sql<{
      timezone_at_event: string;
      local_date: string;
    }>(
      'SELECT timezone_at_event,local_date::text FROM vocabulary_review_events WHERE account_id=$1',
      [a.id],
    );
    expect(reviews[0]!.timezone_at_event).toBe('Europe/Madrid');
    await sql(
      "UPDATE learner_profiles SET timezone='America/New_York' WHERE account_id=$1",
      [a.id],
    );
    expect(
      await sql(
        'SELECT timezone_at_event,local_date::text,occurred_at FROM practice_events WHERE account_id=$1',
        [a.id],
      ),
    ).toEqual(events);
    expect(
      await sql(
        'SELECT timezone_at_event,local_date::text FROM vocabulary_review_events WHERE account_id=$1',
        [a.id],
      ),
    ).toEqual(reviews);
  });
  it.each([
    ['2026-10-04T21:59:59.999Z', 'Europe/Madrid', '2026-10-04'],
    ['2026-10-04T22:00:00.000Z', 'Europe/Madrid', '2026-10-05'],
    ['2026-10-04T22:00:00.001Z', 'Europe/Madrid', '2026-10-05'],
    ['2026-03-29T00:59:59.999Z', 'Europe/Madrid', '2026-03-29'],
    ['2026-03-29T01:00:00.000Z', 'Europe/Madrid', '2026-03-29'],
    ['2026-10-25T01:00:00.000Z', 'Europe/Madrid', '2026-10-25'],
    ['2026-10-05T03:59:59.999Z', 'America/New_York', '2026-10-04'],
  ])(
    'database date snapshots match explicit UTC %s in %s',
    async (instant, zone, date) => {
      const a = await account('calendar'),
        { s } = await start(a.id);
      const turn = (
        await sql<{ id: string }>(
          "INSERT INTO conversation_turns(session_id,account_id,sequence,source_event_key,speaker,text,language) VALUES($1,$2,1,'fixture','learner','synthetic','en') RETURNING id",
          [s.id, a.id],
        )
      )[0]!;
      await sql(
        "INSERT INTO practice_events(account_id,session_id,turn_id,source_key,kind,duration_ms,occurred_at,timezone_at_event,local_date) VALUES($1,$2,$3,'fixture','voice',30000,$4::timestamptz,$5::text,($4::timestamptz AT TIME ZONE $5::text)::date)",
        [a.id, s.id, turn.id, instant, zone],
      );
      expect(
        (
          await sql<{ local_date: string }>(
            'SELECT local_date::text FROM practice_events WHERE account_id=$1',
            [a.id],
          )
        )[0]!.local_date,
      ).toBe(date);
    },
  );
  it('weekly rebuild uses saved dates, >=120 seconds qualifies and source deletion changes metrics', async () => {
    const a = await account('streak'),
      { s } = await start(a.id);
    for (const [day, ms] of [
      ['2026-10-03', 30000],
      ['2026-10-04', 29750],
      ['2026-10-05', 30000],
    ] as const) {
      for (let n = 0; n < 4; n++) {
        const key = `${day}-${n}`,
          turn = (
            await sql<{ id: string }>(
              "INSERT INTO conversation_turns(session_id,account_id,sequence,source_event_key,speaker,text,language) VALUES($1,$2,$3,$4,'learner','synthetic','en') RETURNING id",
              [
                s.id,
                a.id,
                (day === '2026-10-03' ? 0 : day === '2026-10-04' ? 4 : 8) +
                  n +
                  1,
                key,
              ],
            )
          )[0]!;
        await sql(
          "INSERT INTO practice_events(account_id,session_id,turn_id,source_key,kind,duration_ms,occurred_at,timezone_at_event,local_date) VALUES($1,$2,$3,$4,'voice',$5,$6,'UTC',$7)",
          [a.id, s.id, turn.id, key, ms, `${day}T12:00:00Z`, day],
        );
      }
    }
    const rows = await sql<{
      kind: 'voice';
      duration_ms: number;
      local_date: string;
    }>(
      'SELECT kind,duration_ms,local_date::text FROM practice_events WHERE account_id=$1',
      [a.id],
    );
    const metrics = progressMetrics(
      rows.map((r) => ({
        kind: r.kind,
        durationMs: r.duration_ms,
        localDate: r.local_date,
      })),
      [],
      new Date('2026-10-05T12:00:00Z'),
      'UTC',
      { minutesPerDay: 10, daysPerWeek: 3 },
      0,
    );
    expect(metrics).toMatchObject({
      speakingMinutes: 2,
      speakingStreak: { current: 1, longest: 1 },
    });
    expect(await progress.get(a.id)).toEqual(await progress.get(a.id));
    await sql('DELETE FROM practice_sessions WHERE id=$1', [s.id]);
    expect((await progress.get(a.id)).activeMinutes).toBe(0);
  });
  it('immutable M08 review events count once and deleted cards update progress', async () => {
    const a = await account('review'),
      card = await dueCard(a.id),
      reviews = new PostgresVocabularyRepository(),
      input = {
        rating: 'good' as const,
        reviewKey: randomUUID(),
        expectedVersion: 1,
      };
    await Promise.all([
      reviews.review(a.id, card.id, input),
      reviews.review(a.id, card.id, input),
    ]);
    expect(await progress.get(a.id)).toMatchObject({
      reviewsThisWeek: 1,
      reviewsToday: 1,
      speakingMinutes: 0,
    });
    await sql('DELETE FROM vocabulary_suggestions WHERE card_id=$1', [card.id]);
    await sql('DELETE FROM vocabulary_cards WHERE id=$1', [card.id]);
    expect((await progress.get(a.id)).reviewsThisWeek).toBe(0);
  });
  it('isolates metrics, trend evidence and practice sources between two accounts', async () => {
    const a = await account('owner'),
      b = await account('attacker'),
      { c, s } = await start(a.id);
    await c.turn(a.id, s.id, 'owner', 'hello', {
      kind: 'voice',
      durationMs: 30000,
    });
    expect((await progress.get(b.id)).activeMinutes).toBe(0);
    expect(await progress.issues(b.id)).toEqual([]);
    await expect(
      c.turn(b.id, s.id, 'foreign', 'hello', {
        kind: 'voice',
        durationMs: 30000,
      }),
    ).rejects.toThrow('SESSION_NOT_FOUND');
    const turn = (
      await sql<{ id: string }>(
        "SELECT id FROM conversation_turns WHERE session_id=$1 AND speaker='learner'",
        [s.id],
      )
    )[0]!;
    await expect(
      sql(
        "INSERT INTO practice_events(account_id,session_id,turn_id,source_key,kind,duration_ms,timezone_at_event,local_date) VALUES($1,$2,$3,'foreign','voice',30000,'UTC',CURRENT_DATE)",
        [b.id, s.id, turn.id],
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });
  it('shows insufficient trend data and uses current validated M07 observations without improvement claims', async () => {
    const a = await account('trend');
    expect(await progress.issues(a.id)).toEqual([]);
    await dueCard(a.id);
    expect(await progress.issues(a.id)).toEqual([]);
  });
});
function awaitableResult() {
  return { transcript: 'hello', elapsedMs: 0 };
}
