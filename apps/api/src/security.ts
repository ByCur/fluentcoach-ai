import type { Request, Response, NextFunction } from "express";
import { StructuredTelemetry } from "@fluentcoach/infrastructure";
export function securityMiddleware(telemetry = new StructuredTelemetry()) {
  return (request: Request, response: Response, next: NextFunction) => {
    const start = performance.now();
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader(
      "Permissions-Policy",
      "microphone=(self), camera=(), geolocation=()",
    );
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; frame-ancestors 'none'",
    );
    response.setHeader("Cache-Control", "no-store");
    if (
      process.env["NODE_ENV"] === "production" &&
      process.env["PUBLIC_ORIGIN"]?.startsWith("https://")
    )
      response.setHeader("Strict-Transport-Security", "max-age=31536000");
    response.once("finish", () =>
      telemetry.record({
        operation: "http",
        outcome: response.statusCode >= 400 ? "failure" : "success",
        status: response.statusCode,
        durationMs: performance.now() - start,
      }),
    );
    if (request.originalUrl.length > 2048) {
      response.status(414).json({ error: { code: "URL_TOO_LONG" } });
      return;
    }
    next();
  };
}
