import { beforeEach, expect, it } from "vitest";
import {
  ConversationService,
  VoiceTurnService,
  JobService,
  ReportService,
} from "@fluentcoach/application";
import {
  PostgresSessionRepository,
  PostgresJobStore,
  PostgresReportRepository,
  PostgresProgressRepository,
  sql,
} from "@fluentcoach/infrastructure";
import {
  FakeConversationProvider,
  FakeSessionAnalyzer,
} from "@fluentcoach/testing";
import { account, resetDatabase, envelope } from "../support/database.js";
beforeEach(resetDatabase);
it("five concurrent sessions retain every text/voice turn, isolate reports and deterministic progress", async () => {
  const a = await account("load-five"),
    b = await account("load-other"),
    store = new PostgresJobStore(),
    repo = new PostgresSessionRepository(),
    conversation = new ConversationService(
      repo,
      new FakeConversationProvider(),
      store,
    );
  const jobs = new JobService(
    store,
    { enqueue: () => Promise.resolve() },
    new ReportService(
      new PostgresReportRepository(true),
      new FakeSessionAnalyzer(),
    ),
  );
  const voice = new VoiceTurnService(conversation, {
    provider: "fake",
    transcribe: () =>
      Promise.resolve({
        transcript: "A synthetic voice request",
        elapsedMs: 1,
      }),
  });
  const times: number[] = [];
  let errors = 0;
  const measure = async <T>(fn: () => Promise<T>) => {
    const start = performance.now();
    try {
      return await fn();
    } catch (e) {
      errors++;
      throw e;
    } finally {
      times.push(performance.now() - start);
    }
  };
  const started = performance.now();
  const sessions = await Promise.all(
    Array.from({ length: 5 }, async (_, n) => {
      const s = await measure(() =>
        conversation.start(a.id, {
          scenarioSlug: "hotel",
          level: "A1",
          mode: "natural",
        }),
      );
      for (let turn = 0; turn < 3; turn++)
        await measure(() =>
          conversation.turn(
            a.id,
            s.id,
            `load-${n}-${turn}`,
            `session marker ${n} turn ${turn}`,
            { kind: "text", durationMs: 1000 },
          ),
        );
      await measure(() =>
        voice.turn({
          accountId: a.id,
          sessionId: s.id,
          sourceEventKey: `voice-${n}`,
          audio: new Uint8Array([1, 2, 3]),
          mimeType: "audio/webm",
          filename: "synthetic.webm",
          durationMs: 1000,
        }),
      );
      const events = await measure(() => conversation.events(a.id, s.id, 0));
      expect(new Set(events.map((e) => e.sequence)).size).toBe(events.length);
      await measure(() => conversation.end(a.id, s.id));
      const final = await store.finalize({
        accountId: a.id,
        sessionId: s.id,
        hasTurns: true,
      });
      expect(await measure(() => jobs.execute(envelope(final.run)))).toBe(
        "succeeded",
      );
      return s;
    }),
  );
  for (let n = 0; n < sessions.length; n++) {
    const s = sessions[n]!,
      persisted = await measure(() => repo.get(a.id, s.id));
    expect(
      persisted!.turns.filter((t) => t.speaker === "learner"),
    ).toHaveLength(4);
    expect(new Set(persisted!.turns.map((t) => t.sourceEventKey)).size).toBe(
      persisted!.turns.length,
    );
    for (let other = 0; other < 5; other++)
      if (other !== n)
        expect(JSON.stringify(persisted)).not.toContain(
          `session marker ${other}`,
        );
    expect(await repo.get(b.id, s.id)).toBeNull();
    expect(
      (await new PostgresReportRepository(true).view(a.id, s.id)).status,
    ).toBe("succeeded");
  }
  const progress = await measure(() =>
    new PostgresProgressRepository().get(a.id),
  );
  expect(progress.completedSessions).toBe(5);
  expect(progress.textMinutes).toBe(15 / 60);
  expect(progress.speakingMinutes).toBe(5 / 60);
  expect(
    await sql(
      "SELECT 1 FROM analysis_runs WHERE account_id=$1 AND status<>'SUCCEEDED'",
      [a.id],
    ),
  ).toHaveLength(0);
  times.sort((a, b) => a - b);
  console.log(
    JSON.stringify({
      suite: "five-session-pilot",
      durationMs: performance.now() - started,
      requests: times.length,
      p50: times[Math.floor(times.length * 0.5)],
      p95: times[Math.floor(times.length * 0.95)],
      errors,
    }),
  );
  expect(errors).toBe(0);
});
