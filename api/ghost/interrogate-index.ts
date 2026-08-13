/**
 * Vercel Edge Function — POST /api/ghost/interrogate-index
 *
 * Lazily indexes a YouTube video's transcript (chunks + embeddings)
 * into the user's Ghost Memory. Idempotent — if already indexed,
 * returns immediately with a cache-hit flag.
 */
export const runtime = "edge";
export const config = { runtime: "edge" };

import { handleInterrogateIndex } from "../_interrogate.js";

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }
  return handleInterrogateIndex(req);
}
