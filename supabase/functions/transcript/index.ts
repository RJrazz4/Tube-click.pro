import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// Deno npm spec — uses same free lib as Vercel version
import { YoutubeTranscript } from "npm:youtube-transcript@1.2.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function extractId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([^&\?\/\s]{11})/,
    /^([^&\?\/\s]{11})$/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  try {
    const u = new URL(url);
    const v = u.searchParams.get("v");
    if (v && v.length === 11) return v;
  } catch {}
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { url, lang = "en" } = await req.json();

    if (!url || typeof url !== "string") return jsonResponse({ error: "YouTube URL required" }, 400);

    const videoId = extractId(url.trim());
    if (!videoId) return jsonResponse({ error: "Invalid YouTube URL" }, 400);

    try {
      const segments = await YoutubeTranscript.fetchTranscript(videoId, { lang } as any).catch(async () => {
        return await YoutubeTranscript.fetchTranscript(videoId);
      });

      if (Array.isArray(segments) && segments.length > 0) {
        const fullText = segments.map((t: any) => t.text).join(" ");
        return jsonResponse({
          videoId,
          transcript: fullText,
          segments,
          source: "youtube-transcript",
          length: fullText.length,
          wordCount: fullText.split(/\s+/).filter(Boolean).length,
        });
      }
    } catch (e: any) {
      console.warn("Transcript fetch failed", e?.message);
      // Fall through to 404
    }

    return jsonResponse({
      error: "Transcript not available — captions disabled or private video",
      videoId,
      action: "Paste script manually into Repurposer, or try video with captions",
    }, 404);

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: msg }, 500);
  }
});
