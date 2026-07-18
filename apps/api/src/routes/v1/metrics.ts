/**
 * Phase 6 — GET /v1/metrics
 *
 * Exposes the in-memory Metrics Collector snapshot for observability.
 *
 * Returns:
 *   - Global counters (generations, fallback events, tier enforcements)
 *   - Provider-level breakdown (success, failures, key rotations)
 *   - Latency percentiles (p50, p95, p99)
 *   - Uptime since last cold start
 *
 * This endpoint has no auth by default (read-only, no PII).
 * In production, restrict via middleware or Vercel Firewall.
 */

import { metrics } from "../../../../../packages/ai/metrics";
import { logger } from "../../../../../packages/ai/logger";
import { corsHeaders } from "../shared";

export async function handleMetricsV1(req: Request): Promise<Response> {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Allow GET only
  if (req.method !== "GET") {
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed", code: "METHOD_NOT_ALLOWED" }),
      { status: 405, headers: corsHeaders }
    );
  }

  // Optionally reset via query param ?reset=1
  const url = new URL(req.url);
  if (url.searchParams.get("reset") === "1") {
    metrics.reset();
    logger.info("metrics.reset", "Metrics counter reset by request");
    return new Response(
      JSON.stringify({ success: true, data: { message: "Metrics reset" } }),
      { status: 200, headers: corsHeaders }
    );
  }

  const snapshot = metrics.snapshot();

  logger.info("metrics.snapshot", "Metrics snapshot served", {
    totalGenerations: snapshot.totalGenerations,
    fallbackRate: snapshot.fallbackRate,
    p95: snapshot.latency.p95,
  });

  return new Response(
    JSON.stringify({ success: true, data: snapshot }),
    { status: 200, headers: corsHeaders }
  );
}
