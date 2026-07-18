/**
 * Vercel Edge Function — POST /api/v1/thumbnail
 *
 * Thin entry point that delegates to the Phase 4 route handler.
 *
 * Runtime: edge — <50ms cold start for US audience.
 */

import { handleThumbnailV1 } from "../../apps/api/src/routes/v1/thumbnail.js";

export const config = {
  runtime: "edge",
};

export default handleThumbnailV1;
