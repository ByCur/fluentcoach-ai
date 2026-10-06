import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  AiError,
  JobService,
  ReportService,
  VoiceTurnService,
  ConversationService,
} from "@fluentcoach/application";
import {
  OllamaTextAdapter,
  WhisperCppTranscriber,
  PostgresPlanRepository,
  PostgresPrivacyRepository,
  PostgresJobStore,
  PostgresReportRepository,
  PostgresSessionRepository,
  sql,
  StructuredTelemetry,
} from "@fluentcoach/infrastructure";
import {
  FakeSessionAnalyzer,
  FakeConversationProvider,
} from "@fluentcoach/testing";
import { ApiExceptionFilter } from "../../apps/api/src/api-exception.filter.js";
import { RedisSessionStore } from "../../apps/api/src/session.js";
import type { ArgumentsHost } from "@nestjs/common";
import {
  account,
  session,
  envelope,
  resetDatabase,
} from "../support/database.js";
const secret =
  "SUPER_SECRET_API_KEY_123 postgresql://user:password@example/db Bearer secret-token learner@example.test My private learner sentence";
beforeEach(resetDatabase);
afterEach(() => vi.restoreAllMocks());
it("Ollama unavailable fails closed with stable error and no automatic remote fallback", async () => {
  const fetcher = vi.fn<typeof fetch>().mockRejectedValue(Error(secret));
  const ollama = new OllamaTextAdapter({}, fetcher);
  await expect(ollama.assertAvailable()).rejects.toMatchObject({
    code: "unavailable",
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0]![0]).toBe("http://127.0.0.1:11434/api/tags");
});
it("whisper outage and malformed response never store audio or fabricate transcript success", async () => {
  const a = await account("whisper"),
    s = await session(a.id, false),
    whisper = new WhisperCppTranscriber({
      baseUrl: "http://127.0.0.1:1",
      language: "en",
      timeoutMs: 10,
    });
  const voice = new VoiceTurnService(
    new ConversationService(
      new PostgresSessionRepository(),
      new FakeConversationProvider(),
    ),
    whisper,
  );
  await expect(
    voice.turn({
      accountId: a.id,
      sessionId: s.id,
      sourceEventKey: "audio",
      audio: new Uint8Array([1]),
      mimeType: "audio/webm",
      filename: "synthetic.webm",
      durationMs: 1,
    }),
  ).rejects.toMatchObject({ code: "unavailable" });
  expect(
    await sql("SELECT 1 FROM conversation_turns WHERE session_id=$1", [s.id]),
  ).toHaveLength(0);
});
it("Redis unavailable produces bounded rejection and leaves canonical state intact", async () => {
  const a = await account("redis-outage"),
    store = new RedisSessionStore("redis://127.0.0.1:1");
  await expect(store.get("synthetic")).rejects.toThrow();
  expect(await sql("SELECT 1 FROM accounts WHERE id=$1", [a.id])).toHaveLength(
    1,
  );
});
it.each(["timeout", "malformed"] as const)(
  "analysis %s retry exhausts and duplicate delivery cannot fabricate success",
  async (scenario) => {
    const a = await account(scenario),
      s = await session(a.id),
      store = new PostgresJobStore(),
      result = await store.finalize({
        accountId: a.id,
        sessionId: s.id,
        hasTurns: true,
      });
    const jobs = new JobService(
      store,
      { enqueue: () => Promise.resolve() },
      new ReportService(
        new PostgresReportRepository(true),
        new FakeSessionAnalyzer(scenario),
      ),
    );
    for (let n = 0; n < 3; n++)
      expect(await jobs.execute(envelope(result.run))).toBe("failed");
    expect(await jobs.execute(envelope(result.run))).toBe("duplicate");
    expect(
      (
        await sql<{ attempts: number; status: string }>(
          "SELECT attempts,status FROM analysis_runs WHERE id=$1",
          [result.run.id],
        )
      )[0],
    ).toMatchObject({ attempts: 3, status: "FAILED" });
    expect(
      await sql("SELECT 1 FROM session_reports WHERE account_id=$1", [a.id]),
    ).toHaveLength(0);
  },
);
it("deletion revokes while plan generation is blocked; late selection cannot recreate a plan", async () => {
  const a = await account("plan-delete");
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>((r) => {
      entered = r;
    }),
    gate = new Promise<void>((r) => {
      release = r;
    });
  const repo = new PostgresPlanRepository({
    select: async (candidates) => {
      entered();
      await gate;
      return { candidateIds: candidates.slice(0, 2).map((c) => c.candidateId) };
    },
  });
  const generating = repo.generate(a.id, { requestKey: randomUUID() });
  const outcome = generating.catch((e: unknown) => e);
  await started;
  const privacy = new PostgresPrivacyRepository(),
    j = await privacy.requestDeletion(a.id, randomUUID());
  expect(
    (
      await sql<{ status: string }>("SELECT status FROM accounts WHERE id=$1", [
        a.id,
      ])
    )[0]!.status,
  ).toBe("DELETING");
  release();
  expect(await outcome).toBeInstanceOf(Error);
  await privacy.execute(j.id);
  expect(
    await sql("SELECT 1 FROM learning_plans WHERE account_id=$1", [a.id]),
  ).toHaveLength(0);
});
it("real malformed provider, plan failure and audio rejection paths emit closed telemetry without secret text", async () => {
  const lines: string[] = [],
    responses: unknown[] = [],
    filter = new ApiExceptionFilter(
      new StructuredTelemetry((line) => lines.push(line)),
    );
  const response = {
      status: () => response,
      json: (value: unknown) => responses.push(value),
    },
    host = {
      switchToHttp: () => ({ getResponse: () => response }),
    } as unknown as ArgumentsHost;
  const a = await account("redaction"),
    s = await session(a.id, false);
  const operations = [
    () =>
      new OllamaTextAdapter({}, () =>
        Promise.resolve(new Response(secret)),
      ).assertAvailable(),
    () =>
      new PostgresPlanRepository({
        select: () => Promise.reject(Error(secret)),
      }).generate(a.id, { requestKey: randomUUID() }),
    () =>
      new VoiceTurnService(
        new ConversationService(
          new PostgresSessionRepository(),
          new FakeConversationProvider(),
        ),
        {
          provider: "fake",
          transcribe: () => Promise.reject(new AiError("unavailable")),
        },
      ).turn({
        accountId: a.id,
        sessionId: s.id,
        sourceEventKey: "invalid",
        audio: new Uint8Array([1]),
        mimeType: secret,
        filename: secret,
        durationMs: 1,
      }),
  ];
  for (const op of operations) {
    try {
      await op();
      throw Error("Expected failure");
    } catch (e) {
      filter.catch(e, host);
    }
  }
  const output = JSON.stringify([lines, responses]);
  for (const marker of secret.split(" ").filter((s) => s.length > 10))
    expect(output).not.toContain(marker);
  expect(lines).toHaveLength(3);
});
