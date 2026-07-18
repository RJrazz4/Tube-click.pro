/**
 * Vercel Edge Function — GET /api/v1/metrics
 *
 * Exposes in-memory metrics snapshot for observability.
 * Runtime: edge — returns JSON with counters, provider breakdown, latency percentiles.
 */

import { handleMetricsV1 } from "../../apps/api/src/routes/v1/metrics";

export const config = {
  runtime: "edge",
};

export default handleMetricsV1;
