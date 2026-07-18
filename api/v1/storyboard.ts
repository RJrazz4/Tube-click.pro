/**
 * Vercel Edge Function — POST /api/v1/storyboard
 *
 * Thin entry point that delegates to the Phase 4 route handler.
 *
 * Runtime: edge — <50ms cold start for US audience.
 */

import { handleStoryboardV1 } from "../../apps/api/src/routes/v1/storyboard.js";

export const config = {
  runtime: "edge",
};

export default handleStoryboardV1;
