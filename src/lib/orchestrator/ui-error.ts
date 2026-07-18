/**
 * Phase G3 — Shared UI error mapping (consolidated from G1's local copy).
 *
 * One honest mapper for every orchestration surface: 429 carries the
 * Retry-After seconds, 503 names the unavailable stage, status null
 * means the network itself failed. All copy is Gate 4 safe.
 */
import { OrchestratorApiError } from "./client";

export interface UiError {
  title: string;
  message: string;
  retryAfterSeconds?: number;
}

export function toUiError(err: unknown): UiError {
  if (err instanceof OrchestratorApiError) {
    if (err.status === 429) {
      return {
        title: "You're at your plan's request limit",
        message:
          err.retryAfterSeconds !== undefined
            ? `Try again in ${err.retryAfterSeconds}s.`
            : "Please try again in a moment.",
        ...(err.retryAfterSeconds !== undefined
          ? { retryAfterSeconds: err.retryAfterSeconds }
          : {}),
      };
    }
    if (err.status === 503) {
      return { title: "The planning brain is unavailable", message: err.message };
    }
    if (err.status === null) {
      return { title: "Connection problem", message: err.message };
    }
    if (err.status === 400) {
      return { title: "That request wasn't accepted", message: err.message };
    }
    return { title: "Generation failed", message: err.message };
  }
  return {
    title: "Generation failed",
    message: err instanceof Error ? err.message : "Something went wrong — please try again.",
  };
}
