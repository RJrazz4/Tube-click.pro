/**
 * Vercel Edge Function — POST /api/ghost/recon-ingest
 *
 * Ghost Visual Recon (MP5) — sample 12 key frames from the competitor's
 * video, caption each with multimodal Flash, embed captions, persist.
 */
export const runtime = "edge";
export const config = { runtime: "edge" };

import { handleReconIngest } from "../_visualRecon.js";

export default async function handler(req: Request): Promise<Response> {
  return handleReconIngest(req);
}
