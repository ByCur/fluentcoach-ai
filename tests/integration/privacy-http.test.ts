import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { BadRequestException } from "@nestjs/common";
import { json } from "express";
import type { ArgumentsHost } from "@nestjs/common";
import cookieParser from "cookie-parser";
import request from "supertest";
import { PrivacyService } from "@fluentcoach/application";
import {
  PostgresPrivacyRepository,
  StructuredTelemetry,
  sql,
} from "@fluentcoach/infrastructure";
import { AppModule } from "../../apps/api/src/app.module.js";
import { ApiExceptionFilter } from "../../apps/api/src/api-exception.filter.js";
import { PrivacyReconciler } from "../../apps/api/src/privacy-reconciler.js";
import {
  MemorySessionStore,
  SESSION_STORE,
} from "../../apps/api/src/session.js";
import { securityMiddleware } from "../../apps/api/src/security.js";
import { resetDatabase } from "../support/database.js";
const origin = "http://localhost:8080",
  lines: string[] = [];
let app: INestApplication, sessions: MemorySessionStore;
const telemetry = new StructuredTelemetry((line) => lines.push(line));
const login = (subject: string) =>
  request(app.getHttpServer())
    .post("/api/v1/auth/synthetic-login")
    .set("Origin", origin)
    .send({ subject });
const cookie = (r: request.Response) =>
  r.headers["set-cookie"]![0]!.split(";")[0]!;
beforeAll(async () => {
  sessions = new MemorySessionStore();
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SESSION_STORE)
    .useValue(sessions)
    .overrideProvider(PrivacyReconciler)
    .useValue({})
    .compile();
  app = module.createNestApplication({ logger: false, bodyParser: false });
  app.use(securityMiddleware(telemetry));
  app.use(json({ limit: 65536 }));
  app.use(cookieParser());
  app.useGlobalFilters(new ApiExceptionFilter(telemetry));
  await app.init();
});
beforeEach(async () => {
  await resetDatabase();
  await sql("TRUNCATE privacy_jobs,deletion_tombstones CASCADE");
  sessions.sessions.clear();
  lines.length = 0;
});
afterAll(async () => {
  await app.close();
});
describe("M10 authenticated privacy HTTP and logs", () => {
  it("protects export creation by authentication, CSRF, Origin and strict browser ownership fields", async () => {
    const path = "/api/v1/privacy/exports",
      a = await login("http-owner");
    await request(app.getHttpServer())
      .post(path)
      .send({ requestKey: randomUUID() })
      .expect(401);
    await request(app.getHttpServer())
      .post(path)
      .set("Cookie", cookie(a))
      .set("Origin", origin)
      .send({ requestKey: randomUUID() })
      .expect(400);
    await request(app.getHttpServer())
      .post(path)
      .set("Cookie", cookie(a))
      .set("Origin", "https://evil.invalid")
      .set("x-csrf-token", a.body.csrfToken)
      .send({ requestKey: randomUUID() })
      .expect(400);
    await request(app.getHttpServer())
      .post(path)
      .set("Cookie", cookie(a))
      .set("Origin", origin)
      .set("x-csrf-token", a.body.csrfToken)
      .send({ requestKey: randomUUID(), accountId: randomUUID() })
      .expect(400);
  });
  it("foreign/missing export status and downloads return the same response; download uses safe headers", async () => {
    const a = await login("http-a"),
      b = await login("http-b");
    const j = await request(app.getHttpServer())
      .post("/api/v1/privacy/exports")
      .set("Cookie", cookie(a))
      .set("Origin", origin)
      .set("x-csrf-token", a.body.csrfToken)
      .send({ requestKey: randomUUID() })
      .expect(201);
    await new PostgresPrivacyRepository().execute(j.body.id);
    for (const suffix of ["", "/download"]) {
      const foreign = await request(app.getHttpServer())
        .get(`/api/v1/privacy/exports/${j.body.id}${suffix}`)
        .set("Cookie", cookie(b))
        .expect(404);
      const missing = await request(app.getHttpServer())
        .get(`/api/v1/privacy/exports/${randomUUID()}${suffix}`)
        .set("Cookie", cookie(b))
        .expect(404);
      expect(foreign.body).toEqual(missing.body);
    }
    const download = await request(app.getHttpServer())
      .get(`/api/v1/privacy/exports/${j.body.id}/download`)
      .set("Cookie", cookie(a))
      .expect(200);
    expect(download.headers["content-disposition"]).toBe(
      'attachment; filename="fluentcoach-datos.json"',
    );
    expect(download.headers["cache-control"]).toBe("no-store");
  });
  it("requires deliberate current-session deletion confirmation and rejects deletion/tombstone guessed routes", async () => {
    const a = await login("delete-confirm");
    await request(app.getHttpServer())
      .post("/api/v1/privacy/deletion")
      .set("Cookie", cookie(a))
      .set("Origin", origin)
      .set("x-csrf-token", a.body.csrfToken)
      .send({ requestKey: randomUUID(), confirmed: false })
      .expect(400);
    for (const path of [
      "/api/v1/privacy/deletion/" + randomUUID(),
      "/api/v1/privacy/tombstones/" + randomUUID(),
    ])
      await request(app.getHttpServer())
        .get(path)
        .set("Cookie", cookie(a))
        .expect(404);
    await request(app.getHttpServer())
      .post("/api/v1/privacy/deletion")
      .set("Cookie", cookie(a))
      .set("Origin", origin)
      .set("x-csrf-token", a.body.csrfToken)
      .send({
        requestKey: randomUUID(),
        confirmed: true,
        accountId: randomUUID(),
      })
      .expect(400);
  });
  it("already authenticated sessions lose all reads and mutations immediately on canonical DELETING, even with Redis keys retained", async () => {
    const a = await login("revocation"),
      id = (
        await sql<{ id: string }>(
          "SELECT id FROM accounts WHERE oidc_subject='revocation'",
        )
      )[0]!.id;
    const saved = [...sessions.sessions.values()][0]!;
    await app.get(PrivacyService).delete(id, randomUUID(), true);
    const oldCookie = cookie(a),
      opaque = oldCookie.split("=")[1]!;
    for (const [method, path, body] of [
      ["get", "/api/v1/me", {}],
      ["get", "/api/v1/learner-profile", {}],
      ["get", "/api/v1/sessions", {}],
      ["get", "/api/v1/issues", {}],
      ["get", "/api/v1/vocabulary/cards", {}],
      ["get", "/api/v1/plans/current", {}],
      ["get", "/api/v1/progress", {}],
      ["get", `/api/v1/sessions/${randomUUID()}/events`, {}],
      ["get", `/api/v1/sessions/${randomUUID()}/report`, {}],
      ["post", "/api/v1/sessions", {}],
      ["post", `/api/v1/sessions/${randomUUID()}/turns`, {}],
      ["post", `/api/v1/sessions/${randomUUID()}/voice-turns`, {}],
      ["post", `/api/v1/sessions/${randomUUID()}/report/retry`, {}],
      ["post", "/api/v1/privacy/exports", { requestKey: randomUUID() }],
      ["post", "/api/v1/plans/generate", {}],
      ["post", `/api/v1/vocabulary/cards/${randomUUID()}/reviews`, {}],
    ] as const) {
      await sessions.set(opaque, saved);
      const r = request(app.getHttpServer());
      await r[method](path)
        .set("Cookie", oldCookie)
        .set("Origin", origin)
        .set("x-csrf-token", a.body.csrfToken)
        .send(body)
        .expect((response) => {
          expect(response.status, path).toBe(401);
        });
    }
  });
  it("deletion endpoint removes current server cookie and returns no learner data", async () => {
    const a = await login("delete-route");
    const r = await request(app.getHttpServer())
      .post("/api/v1/privacy/deletion")
      .set("Cookie", cookie(a))
      .set("Origin", origin)
      .set("x-csrf-token", a.body.csrfToken)
      .send({ requestKey: randomUUID(), confirmed: true })
      .expect(201);
    expect(r.body.state).toBe("deleting");
    expect(sessions.sessions.size).toBe(0);
    await request(app.getHttpServer())
      .get("/api/v1/me")
      .set("Cookie", cookie(a))
      .expect(401);
  });
  it("browser credentials cannot authorize internal export/retention execution", async () => {
    const a = await login("internal");
    for (const path of ["privacy", "retention"])
      await request(app.getHttpServer())
        .post("/api/v1/jobs/" + path)
        .set("Cookie", cookie(a))
        .set("Origin", origin)
        .set("x-csrf-token", a.body.csrfToken)
        .send({ id: randomUUID(), version: "privacy-job-v1" })
        .expect(503);
  });
  it("returns critical security headers and fails closed on oversized JSON/URLs", async () => {
    const r = await request(app.getHttpServer())
      .get("/health/live")
      .expect(200);
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
    expect(r.headers["content-security-policy"]).toContain(
      "frame-ancestors 'none'",
    );
    expect(r.headers["permissions-policy"]).toContain("microphone=(self)");
    expect(r.headers["referrer-policy"]).toBe("no-referrer");
    await request(app.getHttpServer())
      .get("/" + "x".repeat(2050))
      .expect(414);
    await request(app.getHttpServer())
      .post("/api/v1/privacy/exports")
      .send({ text: "x".repeat(70000) })
      .expect(413);
  });
  it("captures real HTTP validation, Redis, database and malformed exception paths without secrets/content", async () => {
    const secrets = [
        "SUPER_SECRET_API_KEY_123",
        "postgresql://user:password@example/db",
        "Bearer secret-token",
        "learner@example.test",
        "My private learner sentence",
      ],
      secret = secrets.join(" "),
      a = await login("redaction");
    const validation = await request(app.getHttpServer())
      .post("/api/v1/privacy/exports")
      .set("Cookie", cookie(a))
      .set("Origin", origin)
      .set("x-csrf-token", a.body.csrfToken)
      .send({ requestKey: secret })
      .expect(400);
    expect(JSON.stringify(validation.body)).not.toContain(secret);
    // Real connection/session path failure gets caught by the global filter.
    const original = sessions.get.bind(sessions);
    sessions.get = () => Promise.reject(Error(secret));
    const redis = await request(app.getHttpServer())
      .get("/api/v1/me")
      .set("Cookie", cookie(a))
      .expect(500);
    sessions.get = original;
    // Real PostgreSQL validation exception, then the same global application error path.
    let dbError: unknown;
    try {
      await sql("SELECT $1::uuid", [secret]);
    } catch (e) {
      dbError = e;
    }
    const responses: unknown[] = [];
    const response = {
      status: () => response,
      json: (v: unknown) => {
        responses.push(v);
      },
    };
    const host = {
      switchToHttp: () => ({ getResponse: () => response }),
    } as unknown as ArgumentsHost;
    const filter = new ApiExceptionFilter(telemetry);
    filter.catch(dbError, host);
    filter.catch(new BadRequestException(secret), host);
    filter.catch(Error(secret), host);
    const text = JSON.stringify([
      lines,
      validation.body,
      redis.body,
      responses,
    ]);
    for (const value of secrets) expect(text).not.toContain(value);
    expect(lines.length).toBeGreaterThan(0);
  });
});
