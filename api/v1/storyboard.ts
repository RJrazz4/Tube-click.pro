/**
 * Vercel Edge Function — POST /api/v1/storyboard
 *
 * Thin entry point that delegates to the versioned storyboard handler
 * in packages/orchestrator (re-exported through apps/api for parity
 * with the reference router). Runtime: Edge.
 */

import { handleStoryboardV1 } from "../../apps/api/src/routes/v1/storyboard.js";

export const config = {
  runtime: "edge",
};

export default handleStoryboardV1;
