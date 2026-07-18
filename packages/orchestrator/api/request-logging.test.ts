import { describe, expect, it } from "vitest";

import { StructuredLogger, type LogEvent } from "../observability/logger.js";

import { withRequestLogging } from "./request-logging.js";
import type { ApiAuth, ApiResponse } from "./types.js";

const auth: ApiAuth = { tier: "free", clientId: "log-test" };

describe("withRequestLogging — F3 × H1 seam", () => {
  it("logs request and response around the handler with measured latency", async () => {
    const events: LogEvent[] = [];
    const logger = new StructuredLogger({ sink: (e) => events.push(e), now: () => 0, minLevel: "debug" });
    let t = 0;
    const handler = withRequestLogging(
      async (): Promise<ApiResponse> => {
        t += 37; // simulated work
        return { status: 200, body: { ok: true } };
      },
      { logger, path: "/api/v1/storyboard", now: () => t },
    );

    const response = await handler({}, auth);

    expect(response.status).toBe(200);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ event: "api.request", level: "debug", path: "/api/v1/storyboard", tier: "free" });
    expect(events[1]).toMatchObject({ event: "api.response", level: "info", status: 200, latencyMs: 37 });
  });

  it("4xx responses log at warn with status", async () => {
    const events: LogEvent[] = [];
    const logger = new StructuredLogger({ sink: (e) => events.push(e), now: () => 0, minLevel: "debug" });
    const handler = withRequestLogging(
      async (): Promise<ApiResponse> => ({ status: 400, body: { error: { code: "invalid_request", message: "bad" } } }),
      { logger, path: "/api/v1/thumbnails" },
    );
    await handler({}, auth);
    expect(events[1]).toMatchObject({ event: "api.response", level: "warn", status: 400 });
  });

  it("a throwing handler logs api.error and RETHROWS (errors stay loud)", async () => {
    const events: LogEvent[] = [];
    const logger = new StructuredLogger({ sink: (e) => events.push(e), now: () => 0, minLevel: "debug" });
    const handler = withRequestLogging(
      async (): Promise<ApiResponse> => {
        throw new Error("unexpected kaboom");
      },
      { logger, path: "/api/v1/storyboard" },
    );

    await expect(handler({}, auth)).rejects.toThrow("unexpected kaboom");
    const errorEvent = events.find((e) => e.event === "api.error");
    expect(errorEvent).toBeDefined();
    expect(errorEvent).toMatchObject({ level: "error", path: "/api/v1/storyboard" });
    expect(errorEvent?.message).toContain("unexpected kaboom");
    // request still logged, response was not:
    expect(events.map((e) => e.event)).toEqual(["api.request", "api.error"]);
  });
});
