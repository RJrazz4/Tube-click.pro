/**
 * Vercel Edge Function — POST /api/ghost/interrogate-chat
 *
 * Answers one creator question against a previously-indexed competitor
 * video. Vector-retrieves top-k chunks, builds a grounded prompt with
 * [MM:SS] citations, and streams a short analyst response.
 *
 * (Streaming is deferred — MP3 returns a complete JSON answer; streaming
 * will be retrofitted through the Vercel AI SDK in a follow-up without
 * changing the request shape.)
 */
export const runtime = "edge";
export const config = { runtime: "edge" };

import { handleInterrogateChat } from "../_interrogate.js";

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
  return handleInterrogateChat(req);
}
