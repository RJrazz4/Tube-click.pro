/**
 * Phase C2 — shared health probing for adapters (small, timeout-guarded).
 */
import type { ProviderId } from "../types/index.js";

import type { ProviderHealthReport } from "./types.js";

export interface ProbeOptions {
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}

export async function probeHealth(
  provider: ProviderId,
  url: string,
  options: ProbeOptions = {},
): Promise<ProviderHealthReport> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? 5_000;

  const started = now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { headers: options.headers, signal: controller.signal });
    return {
      provider,
      state: res.ok ? "up" : "degraded",
      detail: res.ok ? undefined : `HTTP ${res.status}`,
      latencyMs: now() - started,
      checkedAt: now(),
    };
  } catch (err) {
    return {
      provider,
      state: "down",
      detail: err instanceof Error ? err.message : String(err),
      latencyMs: now() - started,
      checkedAt: now(),
    };
  } finally {
    clearTimeout(timer);
  }
}
