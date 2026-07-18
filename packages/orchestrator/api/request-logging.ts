/**
 * Phase H1 — Request logging wrapper: F3 handlers → H1 events.
 *
 * Wraps any (body, auth) handler so every mount point gets identical
 * telemetry without touching handler code:
 *
 *   api.request  (debug) → handler → api.response (info/warn/error
 *   by status band) — or api.error (error) when the handler throws,
 *   rethrown afterward (handler errors stay loud upstream).
 */
import type { StructuredLogger } from "../observability/logger.js";

import type { ApiAuth, ApiResponse } from "./types.js";

export type ApiHandler = (body: unknown, auth: ApiAuth) => Promise<ApiResponse>;

export interface RequestLoggingOptions {
  logger: StructuredLogger;
  /** Path label for events ("/api/v1/storyboard"). */
  path: string;
  now?: () => number;
}

export function withRequestLogging(
  handler: ApiHandler,
  options: RequestLoggingOptions,
): ApiHandler {
  const now = options.now ?? options.logger.clock;
  return async (body, auth) => {
    options.logger.apiRequest(options.path, auth.tier);
    const startedAt = now();
    try {
      const response = await handler(body, auth);
      options.logger.apiResponse(options.path, response.status, now() - startedAt, auth.tier);
      return response;
    } catch (err) {
      options.logger.apiError(options.path, err, auth.tier);
      throw err;
    }
  };
}
