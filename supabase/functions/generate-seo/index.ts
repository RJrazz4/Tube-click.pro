import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GEMINI_MODEL = "gemini-2.0-flash";
const RETRY_DELAYS = [2000, 5000, 10000];

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function extractGeminiText(data: any) {
  return data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("\n").trim();
}
function cleanupJson(v: string) { return v.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim(); }

async function fetchGeminiWithRetry(url: string, body: unknown): Promise<Response> {
  let last: Response | null = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_DELAYS[attempt - 1];
      const jitter = delay * 0.2 * (Math.random() * 2 - 1);
      await new Promise(r => setTimeout(r, Math.round(delay + jitter)));
    }
    last = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (last.ok || (last.status < 500 && last.status !== 429)) return last;
    if (attempt === RETRY_DELAYS.length) return last;
  }
  return last!;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { keyword, platform = "YouTube", language = "english" } = await req.json();
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("GOOGLE_AI_API_KEY") || "";

    if (!geminiApiKey) return jsonResponse({ error: "GEMINI_API_KEY not configured on server" }, 500);
    if (!keyword || typeof keyword !== "string" || keyword.trim().length < 2) return jsonResponse({ error: "Keyword required min 2 chars" }, 400);
    if (keyword.length > 200) return jsonResponse({ error: "Keyword max 200 chars" }, 400);

    const sanitized = keyword.trim().slice(0, 200);

    const systemPrompt = `
You are a YouTube SEO expert for US premium SaaS audience, specialized in high-CTR tags, search volume estimation, competition analysis, and viral title optimization.

Language: ${language}
Platform: ${platform}

Generate SEO bundle as strict JSON (no markdown):
{
  "tags": ["8-10 high-CTR tags, specific to keyword, include year, how-to, tutorial, strategy, 2026"],
  "seoScore": 0-100 integer (based on keyword potential, trending, low competition high demand),
  "competition": "Low | Medium | High with explanation, e.g., Medium (High Demand, Moderate Competition)",
  "searchVolume": "Estimated, e.g., 45K searches/mo or 1.2K/mo — realistic US YouTube search volume",
  "optimizedTitle": "Viral optimized title with psychological trigger, curiosity gap, 50-60 chars, high CTR"
}

Rules:
- tags must be highly specific, not generic, include long-tail variants
- optimizedTitle must use power words, numbers, curiosity, e.g., "The Ultimate Truth About X (Nobody Is Telling You)"
- seoScore should be high if keyword is trending / high demand
- searchVolume estimation should be realistic for US market
- competition analysis should mention demand vs competition
`;

    const userPrompt = `Keyword/Title: ${sanitized}\nPlatform: ${platform}\nGenerate SEO bundle now.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(geminiApiKey)}`;

    const res = await fetchGeminiWithRetry(url, {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.8 },
    });

    if (!res.ok) {
      const txt = await res.text();
      if (res.status === 401 || res.status === 403) return jsonResponse({ error: "Server Gemini key invalid" }, 500);
      if (res.status === 429) return jsonResponse({ error: "Gemini rate limit exceeded" }, 429);
      return jsonResponse({ error: txt || "Gemini failed" }, res.status);
    }

    const data = await res.json();
    const content = extractGeminiText(data);
    if (!content) return jsonResponse({ error: "Empty Gemini response" }, 502);

    let parsed: any;
    try {
      parsed = JSON.parse(cleanupJson(content));
    } catch {
      // Fallback if Gemini returns malformed JSON
      parsed = {
        tags: [sanitized, `${sanitized} 2026`, `how to ${sanitized}`, `${sanitized} tutorial`, `best ${sanitized} guide`],
        seoScore: 85,
        competition: "Medium (High Demand)",
        searchVolume: "20K searches/mo",
        optimizedTitle: `The Ultimate Truth About ${sanitized} (Nobody Is Telling You)`,
      };
    }

    const tags = Array.isArray(parsed.tags) ? parsed.tags.filter((t: unknown) => typeof t === "string").map((t: string) => t.trim()).filter(Boolean).slice(0, 12) : [];
    const seoScore = typeof parsed.seoScore === "number" ? Math.min(100, Math.max(0, Math.round(parsed.seoScore))) : 85;
    const competition = typeof parsed.competition === "string" ? parsed.competition.trim() : "Medium (High Demand)";
    const searchVolume = typeof parsed.searchVolume === "string" ? parsed.searchVolume.trim() : "20K/mo";
    const optimizedTitle = typeof parsed.optimizedTitle === "string" ? parsed.optimizedTitle.trim().slice(0, 120) : `Ultimate Guide to ${sanitized}`;

    return jsonResponse({ tags, seoScore, competition, searchVolume, optimizedTitle });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: msg }, 500);
  }
});
