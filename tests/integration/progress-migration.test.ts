import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import { expect, it } from 'vitest';
it('upgrades M08 history forward with explicit legacy UTC dates, no fabricated minutes and preserved immutable reviews', async () => {
  const db = new pg.Pool({ connectionString: process.env['DATABASE_URL'] }),
    c = await db.connect(),
    schema = `m09_upgrade_${randomUUID().replaceAll('-', '')}`;
  try {
    await c.query(`CREATE SCHEMA ${schema}`);
    await c.query(`SET search_path TO ${schema},public`);
    await c.query("SET TIME ZONE 'Asia/Tokyo'");
    const root = 'packages/infrastructure/prisma/migrations',
      names = (await readdir(root, { withFileTypes: true }))
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort();
    for (const name of names.filter(
      (n) => n < '202610050003_m09_plans_progress',
    ))
      await c.query(await readFile(`${root}/${name}/migration.sql`, 'utf8'));
    const a = (
      await c.query<{ id: string }>(
        "INSERT INTO accounts(oidc_issuer,oidc_subject) VALUES('synthetic','upgrade') RETURNING id",
      )
    ).rows[0]!;
    const p = (
      await c.query<{ id: string }>(
        "INSERT INTO learner_profiles(account_id,interface_language,native_language,timezone,cefr_level,interests) VALUES($1,'es','es','Europe/Madrid','A1','{}') RETURNING id",
        [a.id],
      )
    ).rows[0]!;
    await c.query(
      "INSERT INTO practice_sessions(account_id,profile_id,scenario_slug,scenario_version,level,mode,prompt_version,state,ended_at) VALUES($1,$2,'hotel',1,'A1','NATURAL','tutor-v4','ENDED','2026-10-04T22:00:00Z')",
      [a.id, p.id],
    );
    const card = (
      await c.query<{ id: string }>(
        "INSERT INTO vocabulary_cards(account_id,phrase,normalized_phrase,scheduler_version,due_at) VALUES($1,'synthetic','synthetic','vocab-scheduler-v1','2026-10-04T22:00:00Z') RETURNING id",
        [a.id],
      )
    ).rows[0]!;
    await c.query(
      "INSERT INTO vocabulary_review_events(account_id,card_id,scheduler_version,review_key,previous_state,rating,reviewed_at,resulting_state,next_due_at) VALUES($1,$2,'vocab-scheduler-v1','legacy','{}','good','2026-10-04T22:00:00Z','{}','2026-10-05T22:00:00Z')",
      [a.id, card.id],
    );
    await c.query(
      await readFile(
        `${root}/202610050003_m09_plans_progress/migration.sql`,
        'utf8',
      ),
    );
    expect(
      (
        await c.query(
          'SELECT kind,duration_ms,timezone_at_event,local_date::text FROM practice_events',
        )
      ).rows,
    ).toEqual([
      {
        kind: 'session-completed',
        duration_ms: 0,
        timezone_at_event: 'UTC',
        local_date: '2026-10-04',
      },
    ]);
    expect(
      (
        await c.query(
          'SELECT review_key,timezone_at_event,local_date::text FROM vocabulary_review_events',
        )
      ).rows,
    ).toEqual([
      {
        review_key: 'legacy',
        timezone_at_event: 'UTC',
        local_date: '2026-10-04',
      },
    ]);
    await expect(
      c.query(
        "UPDATE vocabulary_review_events SET timezone_at_event='Europe/Madrid'",
      ),
    ).rejects.toMatchObject({ code: '55000' });
  } finally {
    await c.query('SET search_path TO public');
    await c.query(`DROP SCHEMA ${schema} CASCADE`);
    c.release();
    await db.end();
  }
});
