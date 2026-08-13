/**
 * Vercel Edge Function — POST /api/ghost/recon-search
 *
 * Ghost Visual Recon search: embed query → cosine top-K over caption
 * vectors for the ingested video, return timestamped thumbnails.
 */
export const runtime = "edge";
export const config = { runtime: "edge" };

import { handleReconSearch } from "../_visualRecon.js";

export default async function handler(req: Request): Promise<Response> {
  return handleReconSearch(req);
}
