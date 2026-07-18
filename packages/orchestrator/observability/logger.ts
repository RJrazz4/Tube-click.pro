/**
 * Phase H1 — Structured logging: JSON events across the pipeline seams.
 *
 * One logger plugs into the hooks that already exist — no pipeline code
 * changes required to observe:
 *
 *   C3 route()          tracker slot      ← logger.asDecisionRecorder()
 *   D3 executor         onHop slot        ← logger.asHopSink()
 *   D4 breaker          onStateChange     ← logger.breakerStateChange()
 *   E3 aggregation      OutcomeSink       ← logger IS one (recordOutcome)
 *   F3 handlers         wrapper (api/)    ← apiRequest/apiResponse/apiError
 *
 * Contract (test-locked):
 *   - every event is { ts, level, event, ...fields } — JSON-serializable
 *   - level gating: minLevel filters by severity order
 *   - REDACTION GUARANTEE: every string field passes the D2 sanitizer
 *     (key material, Bearer tokens, key= params) before it can reach a
 *     log line; string arrays are sanitized and capped at 8 entries
 *   - the sink never throws — logging must never break user flow
 */
import { sanitizeMessage } from "../resilience/index.js";
import type { FallbackHop } from "../resilience/index.js";
import type {
  GenerationResult,
  ProviderErrorKind,
  ProviderId,
  RoutingDecision,
  UserTier,
} from "../types/index.js";

export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export const LOG_EVENT_NAMES = [
  "route.decision",
  "cascade.hop",
  "cascade.result",
  "breaker.state_change",
  "generation.outcome",
  "api.request",
  "api.response",
  "api.error",
] as const;
export type LogEventName = (typeof LOG_EVENT_NAMES)[number];

export type LogFieldValue = string | number | boolean | readonly string[];
export type LogFields = Record<string, LogFieldValue | undefined>;

export interface LogEvent {
  ts: number;
  level: LogLevel;
  event: LogEventName;
  [field: string]: LogFieldValue | undefined;
}

export type LogSink = (event: LogEvent) => void;

const defaultSink: LogSink = (event) => {
  console.log(JSON.stringify(event));
};

export interface StructuredLoggerOptions {
  sink?: LogSink;
  /** Minimum severity to emit; default "info". */
  minLevel?: LogLevel;
  now?: () => number;
  /** Static field stamped on every event (service name). */
  service?: string;
}

const STRING_ARRAY_CAP = 8;

/** Sanitize one field value (defense in depth — see module doc). */
function sanitizeField(value: LogFieldValue | undefined): LogFieldValue | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") return sanitizeMessage(value);
  if (Array.isArray(value)) {
    return (value as readonly string[]).slice(0, STRING_ARRAY_CAP).map((item) =>
      sanitizeMessage(String(item)),
    );
  }
  return value;
}

export class StructuredLogger {
  private readonly sink: LogSink;
  private readonly minLevel: LogLevel;
  private readonly now: () => number;
  private readonly service?: string;

  constructor(options: StructuredLoggerOptions = {}) {
    this.sink = options.sink ?? defaultSink;
    this.minLevel = options.minLevel ?? "info";
    this.now = options.now ?? Date.now;
    if (options.service !== undefined) this.service = options.service;
  }

  get clock(): () => number {
    return this.now;
  }

  /** Core emit — gated, sanitized, non-throwing. */
  emit(event: LogEventName, level: LogLevel, fields: LogFields = {}): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minLevel]) return;
    const logEvent: LogEvent = { ts: this.now(), level, event };
    if (this.service !== undefined) logEvent.service = this.service;
    for (const [key, value] of Object.entries(fields)) {
      const clean = sanitizeField(value);
      if (clean !== undefined) logEvent[key] = clean;
    }
    try {
      this.sink(logEvent);
    } catch {
      // logging must never break user flow
    }
  }

  /* ----------------------------- seam emitters ----------------------------- */

  routeDecision(decision: RoutingDecision): void {
    const fields: LogFields = {
      sceneIndex: decision.sceneIndex,
      provider: decision.providerId,
      providerTier: decision.providerTier,
      reason: decision.reason,
      fallbacks: decision.fallbacks.length,
      complexity: decision.complexity,
    };
    this.emit("route.decision", "debug", fields);
  }

  cascadeHop(sceneIndex: number | undefined, hop: FallbackHop): void {
    const fields: LogFields = {
      ...(sceneIndex !== undefined ? { sceneIndex } : {}),
      provider: hop.provider,
      position: hop.position,
      outcome: hop.outcome,
      latencyMs: hop.latencyMs,
    };
    if (hop.action !== undefined) fields.action = hop.action;
    if (hop.kind !== undefined) fields.kind = hop.kind;
    if (hop.message !== undefined) fields.message = hop.message;
    const level: LogLevel =
      hop.outcome === "failure" ? "warn" : hop.outcome === "skipped" ? "info" : "debug";
    this.emit("cascade.hop", level, fields);
  }

  cascadeResult(result: GenerationResult): void {
    const fields: LogFields = {
      sceneIndex: result.sceneIndex,
      status: result.status,
      provider: result.provider,
      costTier: result.costTier,
      isFallback: result.isFallback,
      attempts: result.attempts,
      keyRotations: result.keyRotations,
      latencyMs: result.latencyMs,
    };
    if (result.error !== undefined) fields.error = result.error;
    this.emit("cascade.result", result.status === "failed" ? "warn" : "info", fields);
  }

  /** D4 onStateChange hook signature. */
  breakerStateChange(
    provider: ProviderId,
    from: string,
    to: string,
    detail?: { totalTrips?: number; lastFailureKind?: ProviderErrorKind },
  ): void {
    this.emit("breaker.state_change", to === "open" ? "warn" : "info", {
      provider,
      from,
      to,
      ...(detail?.totalTrips !== undefined ? { totalTrips: detail.totalTrips } : {}),
      ...(detail?.lastFailureKind !== undefined ? { lastFailureKind: detail.lastFailureKind } : {}),
    });
  }

  /** OutcomeSink-compatible — E3 sinks accept this logger directly. */
  recordOutcome(result: GenerationResult): void {
    this.emit("generation.outcome", result.status === "failed" ? "warn" : "debug", {
      sceneIndex: result.sceneIndex,
      status: result.status,
      provider: result.provider,
      costTier: result.costTier,
      isFallback: result.isFallback,
      keyRotations: result.keyRotations,
    });
  }

  apiRequest(path: string, tier: UserTier): void {
    this.emit("api.request", "debug", { path, tier });
  }

  apiResponse(path: string, status: number, latencyMs: number, tier?: UserTier): void {
    const level: LogLevel = status >= 500 ? "error" : status >= 400 ? "warn" : "info";
    this.emit("api.response", level, {
      path,
      status,
      latencyMs,
      ...(tier !== undefined ? { tier } : {}),
    });
  }

  apiError(path: string, err: unknown, tier?: UserTier): void {
    this.emit("api.error", "error", {
      path,
      message: err instanceof Error ? err.message : String(err),
      ...(tier !== undefined ? { tier } : {}),
    });
  }

  /* ----------------------------- seam adapters ----------------------------- */

  /** C3 RouteContext.tracker slot. */
  asDecisionRecorder(): { record(decision: RoutingDecision): void } {
    return { record: (decision) => this.routeDecision(decision) };
  }

  /** D3 FallbackExecutorOptions.onHop slot (sceneIndex curried). */
  asHopSink(sceneIndex?: number): (hop: FallbackHop) => void {
    return (hop) => this.cascadeHop(sceneIndex, hop);
  }
}
