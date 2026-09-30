import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { expect, it } from 'vitest';
it('upgrades M04 fake successes to pending reports without erasing transcripts and preserves skipped empties', async () => {
  expect(
    process.env['DATABASE_URL'],
    'migration gate requires PostgreSQL',
  ).toBeTruthy();
  const db = new pg.Pool({ connectionString: process.env['DATABASE_URL'] }),
    client = await db.connect(),
    schema = `m05_upgrade_${randomUUID().replaceAll('-', '')}`;
  try {
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema},public`);
    for (const name of [
      '202609290001_m02_identity',
      '202609290002_m03_sessions',
      '202609290003_m04_jobs',
    ])
      await client.query(
        await readFile(
          `packages/infrastructure/prisma/migrations/${name}/migration.sql`,
          'utf8',
        ),
      );
    const account = (
      await client.query<{ id: string }>(
        "INSERT INTO accounts(oidc_issuer,oidc_subject)VALUES('synthetic','upgrade')RETURNING id",
      )
    ).rows[0]!.id;
    const profile = (
      await client.query<{ id: string }>(
        "INSERT INTO learner_profiles(account_id,interface_language,native_language,timezone,cefr_level,interests)VALUES($1,'es','es','UTC','A1','{}')RETURNING id",
        [account],
      )
    ).rows[0]!.id;
    for (const hasTurns of [true, false]) {
      const session = (
        await client.query<{ id: string }>(
          "INSERT INTO practice_sessions(account_id,profile_id,scenario_slug,scenario_version,level,mode,prompt_version,state,transcript_revision)VALUES($1,$2,'hotel',1,'A1','NATURAL','tutor-v1','ENDED',1)RETURNING id",
          [account, profile],
        )
      ).rows[0]!.id;
      if (hasTurns)
        await client.query(
          "INSERT INTO conversation_turns(session_id,account_id,sequence,source_event_key,speaker,text,language)VALUES($1,$2,1,'turn','learner','I need a room','en')",
          [session, account],
        );
      const run = (
        await client.query<{ id: string }>(
          "INSERT INTO analysis_runs(session_id,account_id,transcript_revision,analyzer_version,status)VALUES($1,$2,1,'fake-v1','SUCCEEDED')RETURNING id",
          [session, account],
        )
      ).rows[0]!.id;
      await client.query(
        "INSERT INTO outbox_events(account_id,aggregate_id,event_type,envelope_version,payload,dedupe_key,published_at)VALUES($1,$2,'analysis.requested',1,$3,$4,now())",
        [
          account,
          session,
          {
            version: 1,
            analysisRunId: run,
            accountId: account,
            sessionId: session,
            transcriptRevision: 1,
          },
          `analysis:${run}`,
        ],
      );
    }
    await client.query(
      await readFile(
        'packages/infrastructure/prisma/migrations/202609300004_m05_reports/migration.sql',
        'utf8',
      ),
    );
    expect(
      (
        await client.query<{ status: string }>(
          'SELECT status FROM analysis_runs ORDER BY created_at',
        )
      ).rows.map((row) => row.status),
    ).toEqual(['PENDING', 'SKIPPED']);
    expect(
      (await client.query('SELECT * FROM conversation_turns')).rowCount,
    ).toBe(1);
    expect((await client.query('SELECT * FROM session_reports')).rowCount).toBe(
      0,
    );
    expect(
      (
        await client.query(
          'SELECT * FROM outbox_events WHERE published_at IS NULL',
        )
      ).rowCount,
    ).toBe(1);
  } finally {
    await client.query('SET search_path TO public');
    await client.query(`DROP SCHEMA ${schema} CASCADE`);
    client.release();
    await db.end();
  }
});
