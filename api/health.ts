import { corsHeaders, jsonResponse, requestId } from "./_shared.js";

export const config = { runtime: "edge" };

export default function handler(req: Request) {
  const id = requestId(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: { ...corsHeaders, "x-request-id": id } });
  if (req.method !== "GET") return jsonResponse({ error: "Method not allowed", code: "METHOD_NOT_ALLOWED" }, 405, id);

  return jsonResponse({
    ok: true,
    service: "tubeclick-pro-api",
    timestamp: new Date().toISOString(),
    requestId: id,
    routes: { voice: "/api/elevenlabs-tts", chat: "/api/generate-text" },
  }, 200, id);
}
