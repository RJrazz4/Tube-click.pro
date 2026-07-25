/**
 * Vercel Edge Function — POST /api/v1/thumbnail
 *
 * Thin entry point that delegates to the versioned thumbnail handler
 * in packages/orchestrator (re-exported through apps/api for parity
 * with the reference router). Runtime: Edge.
 */

import { handleThumbnailV1 } from "../../apps/api/src/routes/v1/thumbnail.js";

export const config = {
  runtime: "edge",
};

export default handleThumbnailV1;
