import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import { expect, it } from 'vitest';
it('upgrades the existing schema with learner reports intact and enforces composite source ownership', async () => {
  expect(
    process.env['DATABASE_URL'],
    'migration gate requires PostgreSQL',
  ).toBeTruthy();
  const db = new pg.Pool({ connectionString: process.env['DATABASE_URL'] }),
    c = await db.connect();
  const schema = `m07_upgrade_${randomUUID().replaceAll('-', '')}`;
  const root = 'packages/infrastructure/prisma/migrations';
  try {
    await c.query(`CREATE SCHEMA ${schema}`);
    await c.query(`SET search_path TO ${schema},public`);
    for (const name of (await readdir(root))
      .filter((name) => name.startsWith('202609'))
      .sort())
      await c.query(await readFile(`${root}/${name}/migration.sql`, 'utf8'));
    const a = (
      await c.query<{ id: string }>(
        "INSERT INTO accounts(oidc_issuer,oidc_subject)VALUES('synthetic','old-report')RETURNING id",
      )
    ).rows[0]!.id;
    const profile = (
      await c.query<{ id: string }>(
        "INSERT INTO learner_profiles(account_id,interface_language,native_language,timezone,cefr_level,interests)VALUES($1,'es','es','UTC','A1','{}')RETURNING id",
        [a],
      )
    ).rows[0]!.id;
    const s = (
      await c.query<{ id: string }>(
        "INSERT INTO practice_sessions(account_id,profile_id,scenario_slug,scenario_version,level,mode,prompt_version,state,transcript_revision)VALUES($1,$2,'hotel',1,'A1','NATURAL','tutor-v4','ENDED',1)RETURNING id",
        [a, profile],
      )
    ).rows[0]!.id;
    await c.query(
      "INSERT INTO transcript_revisions(session_id,account_id,revision,source_key,content_hash,turns,partial)VALUES($1,$2,1,'finalization','hash','[]',false)",
      [s, a],
    );
    const run = (
      await c.query<{ id: string }>(
        "INSERT INTO analysis_runs(session_id,account_id,transcript_revision,analyzer_version,status)VALUES($1,$2,1,'analysis-v2','SUCCEEDED')RETURNING id",
        [s, a],
      )
    ).rows[0]!.id;
    await c.query(
      "INSERT INTO session_reports(analysis_run_id,session_id,account_id,transcript_revision,schema_version,content)VALUES($1,$2,$3,1,'report-v1',$4)",
      [
        run,
        s,
        a,
        {
          schemaVersion: 'report-v1',
          rubricVersion: 'pilot-text-v1',
          strengths: [],
          corrections: [],
        },
      ],
    );
    const before = (await c.query('SELECT * FROM session_reports')).rows;
    await c.query(
      await readFile(
        `${root}/202610050001_m07_recurring_issues/migration.sql`,
        'utf8',
      ),
    );
    expect((await c.query('SELECT * FROM session_reports')).rows).toEqual(
      before,
    );
    expect((await c.query('SELECT * FROM issue_observations')).rows).toEqual(
      [],
    );
    expect(
      (await c.query('SELECT * FROM recurring_issue_aggregates')).rows,
    ).toEqual([]);
    const insert =
      "INSERT INTO issue_observations(account_id,taxonomy_version,issue_key,label,category,session_id,report_id,analysis_run_id,transcript_revision,turn_sequence,evidence_start,evidence_end,quote,uncertainty,occurred_at)VALUES($1,'language-issues-v1','verb-tense','Tiempos verbales','grammar',$2,$3,$4,1,1,0,4,'I go','low',now())";
    await c.query(insert, [a, s, before[0]!.id, run]);
    await expect(
      c.query(insert, [a, s, before[0]!.id, run]),
    ).rejects.toMatchObject({ code: '23505' });
    await expect(
      c.query('UPDATE issue_observations SET analysis_run_id=$1', [
        randomUUID(),
      ]),
    ).rejects.toMatchObject({ code: '23503' });
  } finally {
    await c.query('SET search_path TO public');
    await c.query(`DROP SCHEMA ${schema} CASCADE`);
    c.release();
    await db.end();
  }
});
