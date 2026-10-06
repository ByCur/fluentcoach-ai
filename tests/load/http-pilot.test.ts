import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import cookieParser from "cookie-parser";
import request from "supertest";
import { AppModule } from "../../apps/api/src/app.module.js";
import { ApiExceptionFilter } from "../../apps/api/src/api-exception.filter.js";
import {
  MemorySessionStore,
  SESSION_STORE,
} from "../../apps/api/src/session.js";
import { sql, PostgresSessionRepository } from "@fluentcoach/infrastructure";
import type { SessionRecord } from "@fluentcoach/application";
import { resetDatabase } from "../support/database.js";
let app: INestApplication;
beforeAll(async () => {
  await resetDatabase();
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SESSION_STORE)
    .useValue(new MemorySessionStore())
    .compile();
  app = module.createNestApplication({ logger: false });
  app.use(cookieParser());
  app.useGlobalFilters(new ApiExceptionFilter());
  await app.init();
  // Own one listening server for the entire concurrent run. Otherwise Supertest
  // starts/closes a temporary listener per request and can reset overlapping calls.
  await app.listen(0, '127.0.0.1');
});
afterAll(async () => {
  await app.close();
});
it("five HTTP sessions complete text, voice, durable reports and progress without 5xx or isolation failures", async () => {
  const origin = "http://localhost:8080",
    times: number[] = [];
  let errors = 0;
  const measured = async (fn: () => PromiseLike<request.Response>) => {
    const start = performance.now();
    const response = await fn();
    times.push(performance.now() - start);
    if (response.status >= 500) errors++;
    return response;
  };
  const started = performance.now(),
    auth = await measured(() =>
      request(app.getHttpServer())
        .post("/api/v1/auth/synthetic-login")
        .set("Origin", origin)
        .send({ subject: "http-load-" + randomUUID() }),
    );
  const cookie = auth.headers["set-cookie"]![0]!.split(";")[0]!,
    csrf = auth.body.csrfToken as string;
  const post = (path: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post("/api/v1" + path)
      .set("Cookie", cookie)
      .set("Origin", origin)
      .set("x-csrf-token", csrf)
      .send(body);
  const me = await measured(() =>
      request(app.getHttpServer()).get("/api/v1/me").set("Cookie", cookie),
    ),
    id = me.body.id as string;
  await sql(
    "INSERT INTO learner_profiles(account_id,interface_language,native_language,timezone,cefr_level,interests) VALUES($1,'es','es','UTC','A1','{}')",
    [id],
  );
  const records = await Promise.all(
    Array.from({ length: 5 }, async (_, n) => {
      const start = await measured(() =>
        post("/sessions", {
          scenarioSlug: "hotel",
          level: "A1",
          mode: "natural",
        }),
      );
      expect(start.status).toBe(201);
      const s = start.body as SessionRecord;
      for (let turn = 0; turn < 2; turn++) {
        const r = await measured(() =>
          post(`/sessions/${s.id}/turns`, {
            sourceEventKey: `http-${n}-${turn}`,
            text: `http session ${n} turn ${turn}`,
            activeDurationMs: 1000,
          }),
        );
        expect(r.status).toBe(201);
      }
      const voice = await measured(() =>
        request(app.getHttpServer())
          .post(`/api/v1/sessions/${s.id}/voice-turns`)
          .set("Cookie", cookie)
          .set("Origin", origin)
          .set("x-csrf-token", csrf)
          .field("sourceEventKey", "voice")
          .field("durationMs", "1000")
          .attach("audio", Buffer.from([1, 2, 3]), {
            filename: "synthetic.webm",
            contentType: "audio/webm",
          }),
      );
      expect(voice.status).toBe(201);
      expect(
        (await measured(() => post(`/sessions/${s.id}/end`, {}))).status,
      ).toBe(201);
      let report: request.Response | undefined;
      for (let poll = 0; poll < 50; poll++) {
        report = await measured(() =>
          request(app.getHttpServer())
            .get(`/api/v1/sessions/${s.id}/report`)
            .set("Cookie", cookie),
        );
        expect(report.status).toBe(200);
        if (report.body.status === "succeeded") break;
        await new Promise((r) => setTimeout(r, 100));
      }
      expect(report?.body.status).toBe("succeeded");
      return s;
    }),
  );
  const foreign = await measured(() =>
      request(app.getHttpServer())
        .post("/api/v1/auth/synthetic-login")
        .set("Origin", origin)
        .send({ subject: "http-load-foreign-" + randomUUID() }),
    ),
    foreignCookie = foreign.headers["set-cookie"]![0]!.split(";")[0]!;
  for (let n = 0; n < 5; n++) {
    const record = await new PostgresSessionRepository().get(
      id,
      records[n]!.id,
    );
    expect(record!.turns.filter((t) => t.speaker === "learner")).toHaveLength(
      3,
    );
    expect(new Set(record!.turns.map((t) => t.sourceEventKey)).size).toBe(
      record!.turns.length,
    );
    for (let other = 0; other < 5; other++)
      if (other !== n)
        expect(JSON.stringify(record)).not.toContain(`http session ${other}`);
    expect(
      (
        await measured(() =>
          request(app.getHttpServer())
            .get(`/api/v1/sessions/${record!.id}/report`)
            .set("Cookie", foreignCookie),
        )
      ).status,
    ).toBe(404);
  }
  const progress = await measured(() =>
    request(app.getHttpServer()).get("/api/v1/progress").set("Cookie", cookie),
  );
  expect(progress.status).toBe(200);
  expect(progress.body.completedSessions).toBe(5);
  expect(progress.body.textMinutes).toBe(10 / 60);
  expect(progress.body.speakingMinutes).toBe(5 / 60);
  times.sort((a, b) => a - b);
  console.log(
    JSON.stringify({
      suite: "five-session-http-pilot",
      durationMs: performance.now() - started,
      requests: times.length,
      p50: times[Math.floor(times.length * 0.5)],
      p95: times[Math.floor(times.length * 0.95)],
      errors,
    }),
  );
  expect(errors).toBe(0);
});
