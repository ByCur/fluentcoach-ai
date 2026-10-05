import {
  ConversationService,
  JobService,
  ReportService,
} from '@fluentcoach/application';
import {
  PostgresSessionRepository,
  PostgresJobStore,
  PostgresReportRepository,
  PostgresVocabularyRepository,
} from '@fluentcoach/infrastructure';
import {
  FakeConversationProvider,
  FakeSessionAnalyzer,
} from '@fluentcoach/testing';
import { envelope } from './database.js';
export async function reportPractice(accountId: string, count = 2) {
  const store = new PostgresJobStore(),
    service = new ConversationService(
      new PostgresSessionRepository(),
      new FakeConversationProvider(),
      store,
    );
  const session = await service.start(accountId, {
    scenarioSlug: 'hotel',
    level: 'A1',
    mode: 'natural',
  });
  for (let n = 0; n < count; n++)
    await service.turn(
      accountId,
      session.id,
      `turn-${n}`,
      `Yesterday I go to the hotel ${n}`,
    );
  const result = await store.finalize({
    accountId,
    sessionId: session.id,
    hasTurns: true,
  });
  const jobs = new JobService(
    store,
    { enqueue: () => Promise.resolve() },
    new ReportService(
      new PostgresReportRepository(true),
      new FakeSessionAnalyzer(),
    ),
  );
  await jobs.execute(envelope(result.run));
  return session;
}
export async function dueCard(accountId: string) {
  await reportPractice(accountId, 1);
  const repo = new PostgresVocabularyRepository();
  const suggestion = (await repo.listSuggestions(accountId))[0]!;
  return repo.confirm(accountId, suggestion.id);
}
