import { describe, expect, it } from "vitest";

import { CircuitBreaker } from "../resilience/index.js";
import type { FallbackHop } from "../resilience/index.js";
import type { GenerationResult, RoutingDecision } from "../types/index.js";

import {
  StructuredLogger,
  LOG_EVENT_NAMES,
  type LogEvent,
} from "./logger.js";

function collector(): { events: LogEvent[]; sink: (event: LogEvent) => void } {
  const events: LogEvent[] = [];
  return { events, sink: (event) => events.push(event) };
}

const decision: RoutingDecision = {
  sceneIndex: 2,
  complexity: "SIMPLE",
  providerId: "hf",
  providerTier: "free",
  reason: "complexity-match",
  fallbacks: ["pollinations"],
  decidedAt: 1000,
};

const result: GenerationResult = {
  sceneIndex: 2,
  status: "success",
  imageUrl: "https://img.test/x.png",
  provider: "hf",
  costTier: "free",
  isFallback: false,
  attempts: 1,
  keyRotations: 0,
  latencyMs: 120,
};

describe("StructuredLogger — event contract", () => {
  it("emits { ts, level, event, ...fields } as JSON-safe objects", () => {
    const { events, sink } = collector();
    const logger = new StructuredLogger({ sink, now: () => 42, service: "orchestrator", minLevel: "debug" });
    logger.routeDecision(decision);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      ts: 42,
      level: "debug",
      event: "route.decision",
      service: "orchestrator",
      sceneIndex: 2,
      provider: "hf",
      providerTier: "free",
      reason: "complexity-match",
      fallbacks: 1,
      complexity: "SIMPLE",
    });
    expect(() => JSON.stringify(events[0])).not.toThrow();
  });

  it("level gating keeps debug events at the default info floor", () => {
    const { events, sink } = collector();
    const logger = new StructuredLogger({ sink, now: () => 0 }); // default minLevel "info"

    logger.routeDecision(decision); // debug — high-volume at 10k, gated by default
    logger.recordOutcome(result); // success outcome is debug too
    logger.cascadeResult(result); // info — passes

    expect(events.map((e) => e.event)).toEqual(["cascade.result"]);
  });

  it("level gating: minLevel filters by severity order", () => {
    const { events, sink } = collector();
    const logger = new StructuredLogger({ sink, minLevel: "warn", now: () => 0 });

    logger.routeDecision(decision); // debug — gated
    logger.apiResponse("/x", 200, 10); // info — gated
    logger.apiResponse("/x", 429, 10); // warn — passes
    logger.apiError("/x", new Error("boom")); // error — passes

    expect(events.map((e) => e.event)).toEqual(["api.response", "api.error"]);
  });

  it("response level follows the status band (5xx error, 4xx warn, 2xx info)", () => {
    const { events, sink } = collector();
    const logger = new StructuredLogger({ sink, now: () => 0 });
    logger.apiResponse("/x", 200, 5);
    logger.apiResponse("/x", 400, 5);
    logger.apiResponse("/x", 503, 5);
    expect(events.map((e) => e.level)).toEqual(["info", "warn", "error"]);
  });

  it("event name registry is stable", () => {
    expect([...LOG_EVENT_NAMES]).toEqual([
      "route.decision",
      "cascade.hop",
      "cascade.result",
      "breaker.state_change",
      "generation.outcome",
      "api.request",
      "api.response",
      "api.error",
    ]);
  });
});

describe("StructuredLogger — redaction guarantee", () => {
  it("key material in string fields is redacted before the sink", () => {
    const { events, sink } = collector();
    const logger = new StructuredLogger({ sink, now: () => 0 });
    logger.apiError("/x", new Error("auth failed for sk-or-v1-deadbeefcafe with Bearer tok123abc"));
    expect(events[0]?.message).not.toContain("sk-or-v1-deadbeefcafe");
    expect(events[0]?.message).not.toContain("tok123abc");
  });

  it("sanitizes hop messages from the executor seam too", () => {
    const { events, sink } = collector();
    const logger = new StructuredLogger({ sink, now: () => 0 });
    const hop: FallbackHop = {
      provider: "hf",
      position: 0,
      outcome: "failure",
      action: "cooldown-provider",
      kind: "rate_limit",
      message: "hf HTTP 429 retry key=live_secret_987654",
      latencyMs: 12,
    };
    logger.asHopSink(0)(hop);
    expect(events[0]?.message).not.toContain("live_secret_987654");
    expect(events[0]?.message).toContain("key=***");
  });
});

describe("StructuredLogger — seam adapters", () => {
  it("asDecisionRecorder() fits C3's tracker slot exactly", () => {
    const { events, sink } = collector();
    const logger = new StructuredLogger({ sink, now: () => 0, minLevel: "debug" });
    logger.asDecisionRecorder().record(decision);
    expect(events[0]?.event).toBe("route.decision");
  });

  it("asHopSink() levels: failure warns, skipped informs, success debugs", () => {
    const { events, sink } = collector();
    const logger = new StructuredLogger({ sink, now: () => 0, minLevel: "debug" });
    const hopSink = logger.asHopSink(3);
    hopSink({ provider: "hf", position: 0, outcome: "failure", kind: "timeout", message: "t", latencyMs: 1 });
    hopSink({ provider: "agnes", position: 1, outcome: "skipped", message: "circuit open", latencyMs: 0 });
    hopSink({ provider: "pollinations", position: 2, outcome: "success", latencyMs: 50 });
    expect(events.map((e) => [e.event, e.level, e.sceneIndex])).toEqual([
      ["cascade.hop", "warn", 3],
      ["cascade.hop", "info", 3],
      ["cascade.hop", "debug", 3],
    ]);
  });

  it("logger IS an OutcomeSink (recordOutcome) for E3 — success is debug, failure warns", () => {
    const { events, sink } = collector();
    const logger = new StructuredLogger({ sink, now: () => 0, minLevel: "debug" });
    logger.recordOutcome(result);
    logger.recordOutcome({ ...result, status: "failed" });
    expect(events.map((e) => [e.event, e.level])).toEqual([
      ["generation.outcome", "debug"],
      ["generation.outcome", "warn"],
    ]);
  });

  it("cascadeResult carries the full generation envelope", () => {
    const { events, sink } = collector();
    const logger = new StructuredLogger({ sink, now: () => 0 });
    logger.cascadeResult({ ...result, isFallback: true, keyRotations: 2 });
    expect(events[0]).toMatchObject({
      event: "cascade.result",
      level: "info",
      isFallback: true,
      keyRotations: 2,
      costTier: "free",
    });
  });

  it("a throwing sink can never break the logger", () => {
    const logger = new StructuredLogger({
      sink: () => {
        throw new Error("log backend down");
      },
      now: () => 0,
    });
    expect(() => logger.routeDecision(decision)).not.toThrow();
    expect(() => logger.apiError("/x", new Error("boom"))).not.toThrow();
  });
});

describe("StructuredLogger × D4 — breaker state-change hook", () => {
  it("trip and recovery fire exactly once each; path-tics stay silent", () => {
    const { events, sink } = collector();
    const logger = new StructuredLogger({ sink, now: () => 0 });
    let t = 0;
    const breaker = new CircuitBreaker({
      failureThreshold: 2,
      cooldownMs: 20_000,
      now: () => t,
      onStateChange: (change) => logger.breakerStateChange(change.provider, change.from, change.to, change),
    });

    breaker.recordFailure("hf"); // 1/2 — no transition
    breaker.recordFailure("hf"); // trip: closed → open
    breaker.recordFailure("hf"); // still open — no NEW transition
    t = 20_000; // half-open window
    breaker.recordSuccess("hf"); // half-open → closed recovery

    const changes = events.filter((e) => e.event === "breaker.state_change");
    expect(changes.map((e) => [e.from, e.to, e.level])).toEqual([
      ["closed", "open", "warn"],
      ["half-open", "closed", "info"],
    ]);
    expect(changes[0]).toMatchObject({ provider: "hf", totalTrips: 1 });
  });
});
