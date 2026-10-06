import { pool, sql, PostgresVocabularyRepository, PostgresIssueRepository } from '@fluentcoach/infrastructure';
import { reportPractice } from './m09.js';

async function seed() {
  try {
    const accountId = process.argv[2];
    if (!accountId || !/^[a-f0-9-]{36}$/.test(accountId) || !new URL(process.env['DATABASE_URL'] ?? '').pathname.endsWith('_test'))
      throw Error('Synthetic browser fixture requires an isolated test database');
    const owned = await sql("SELECT id FROM accounts WHERE id=$1 AND oidc_issuer='https://synthetic.invalid/' AND oidc_subject LIKE 'roadmap-%'", [accountId]);
    if (owned.length !== 1) throw Error('Synthetic roadmap learner required');
    const vocabulary = new PostgresVocabularyRepository();
    for (let n = 0; n < 6; n++) {
      const practice = await reportPractice(accountId, 1);
      await sql("UPDATE session_reports SET content=jsonb_set(content,'{corrections,0,practice}',$3::jsonb) WHERE session_id=$1 AND account_id=$2",
        [practice.id, accountId, JSON.stringify(`Could I book room number ${n}?`)]);
      const suggestion = (await vocabulary.listSuggestions(accountId)).find(s => s.sourceSessionId === practice.id)!;
      await vocabulary.confirm(accountId, suggestion.id);
    }
    await new PostgresIssueRepository().setDismissed(accountId, 'verb-tense', true);
  } finally {await pool.end();}
}
void seed().catch(error => {console.error(error instanceof Error ? error.message : 'Fixture failed'); process.exitCode = 1;});
