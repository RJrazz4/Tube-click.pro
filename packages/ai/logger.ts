/**
 * Phase 6 — Structured Logger for Edge & Node Runtimes
 *
 * Produces JSON-formatted log lines with a consistent schema suitable
 * for ingestion by Axiom, Logtail, Datadog, or any JSON-log consumer.
 *
 * Works in:
 *   - Vercel Edge (process.env, Web API)
 *   - Supabase Edge (Deno)
 *   - Node.js 18+
 *
 * Usage:
 *   import { logger } from "../../packages/ai/logger.js";
 *
 *   logger.info("storyboard.generate", "Starting batch generation", {
 *     sceneCount: 5, tier: "free", brand: "Tube.Flash"
 *   });
 *
 *   logger.error("provider.rotate", "All keys exhausted", {
 *     provider: "agnes-flash", totalKeys: 3, totalMs: 4523,
 *   });
 */

/* ------------------------------------------------------------------ *
 * Log levels
 * ------------------------------------------------------------------ */

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

const LEVEL_NUM: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

/* ------------------------------------------------------------------ *
 * Log entry schema
 * ------------------------------------------------------------------ */

export interface LogEntry {
  /** ISO-8601 timestamp. */
  t: string;
  /** Log level. */
  lvl: LogLevel;
  /** Dot-separated event name (e.g. "storyboard.generate.start"). */
  event: string;
  /** Human-readable message. */
  msg: string;
  /** Arbitrary structured metadata. */
  meta?: Record<string, unknown>;
  /** Correlation / request ID for tracing. */
  rid?: string;
  /** Wall-clock duration in milliseconds (when applicable). */
  durMs?: number;
  /** Provider name (when applicable). */
  provider?: string;
  /** Error stack trace (error level only). */
  stack?: string;
}

/* ------------------------------------------------------------------ *
 * Logger implementation
 * ------------------------------------------------------------------ */

class StructuredLogger {
  private minLevel: number;

  constructor(level?: LogLevel) {
    // Respect LOG_LEVEL env; default info
    const envLevel = typeof process !== "undefined"
      ? (process.env?.LOG_LEVEL as LogLevel)
      : undefined;
    this.minLevel = LEVEL_NUM[envLevel || level || "info"] ?? 1;
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_NUM[level] >= this.minLevel;
  }

  private emit(entry: LogEntry): void {
    if (!this.shouldLog(entry.lvl)) return;

    const line = JSON.stringify(entry);
    switch (entry.lvl) {
      case "error":
      case "fatal":
        console.error(line);
        break;
      case "warn":
        console.warn(line);
        break;
      default:
        console.log(line);
    }
  }

  debug(event: string, msg: string, meta?: Record<string, unknown>): void {
    this.emit({ t: new Date().toISOString(), lvl: "debug", event, msg, meta });
  }

  info(event: string, msg: string, meta?: Record<string, unknown>): void {
    this.emit({ t: new Date().toISOString(), lvl: "info", event, msg, meta });
  }

  warn(event: string, msg: string, meta?: Record<string, unknown>): void {
    this.emit({ t: new Date().toISOString(), lvl: "warn", event, msg, meta });
  }

  error(
    event: string,
    msg: string,
    meta?: Record<string, unknown>,
    error?: Error
  ): void {
    this.emit({
      t: new Date().toISOString(),
      lvl: "error",
      event,
      msg,
      meta,
      stack: error?.stack,
    });
  }

  fatal(
    event: string,
    msg: string,
    meta?: Record<string, unknown>,
    error?: Error
  ): void {
    this.emit({
      t: new Date().toISOString(),
      lvl: "fatal",
      event,
      msg,
      meta,
      stack: error?.stack,
    });
  }

  /**
   * Create a child logger with a fixed set of meta fields merged into
   * every log entry — useful for scoped logging (e.g. per-request).
   */
  child(defaultMeta: Record<string, unknown>): StructuredLogger {
    return new Proxy(this, {
      get(target, prop) {
        if (prop === "child") return target.child.bind(target);
        const method = target[prop as keyof StructuredLogger];
        if (typeof method !== "function") return method;
        // Bind the method to the target (logger instance) to preserve `this` context
        // so that internal calls like `this.emit()` work correctly.
        const boundMethod = method.bind(target);
        return (...args: any[]) => {
          const event = args[0] as string;
          const msg = args[1] as string;
          const meta = (args[2] as Record<string, unknown>) || {};
          // Merge default meta with caller's meta (caller wins)
          const mergedMeta = { ...defaultMeta, ...meta };
          boundMethod(event, msg, mergedMeta, args[3]);
        };
      },
    });
  }

  /**
   * Set the minimum log level at runtime.
   */
  setLevel(level: LogLevel): void {
    this.minLevel = LEVEL_NUM[level] ?? 1;
  }
}

/** Singleton logger instance. */
export const logger = new StructuredLogger();

export default logger;
