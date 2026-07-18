/**
 * Phase H2 — Observability endpoints: /metrics, /metrics.json, /health.
 *
 * Same ApiResponse shape as F3 — any mount serves them unchanged.
 *   GET /metrics       → Prometheus text exposition (text/plain)
 *   GET /metrics.json  → the same truth as a JSON document
 *   GET /health        → 200 ok/degraded, 503 down (load-balancer ready)
 */
import {
  healthReport,
  observabilitySnapshot,
  prometheusText,
  type HealthDeps,
  type ObservabilityDeps,
} from "../observability/index.js";

import type { ApiResponse } from "./types.js";

export const PROMETHEUS_CONTENT_TYPE = "text/plain; version=0.0.4; charset=utf-8";

export function handleMetrics(deps: ObservabilityDeps): ApiResponse {
  return {
    status: 200,
    body: prometheusText(observabilitySnapshot(deps)),
    headers: { "content-type": PROMETHEUS_CONTENT_TYPE },
  };
}

export function handleMetricsJson(deps: ObservabilityDeps): ApiResponse {
  return { status: 200, body: observabilitySnapshot(deps) };
}

/** 200 when traffic can flow somewhere; 503 only when truly down. */
export function handleHealth(deps: HealthDeps): ApiResponse {
  const report = healthReport(deps);
  return { status: report.status === "down" ? 503 : 200, body: report };
}
