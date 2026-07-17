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
  return data?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text || "")
    .join("\n")
    .trim();
}

function cleanupJson(value: string) {
  return value.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
}

function normalizeStringArray(values: unknown, fallback: string[]) {
  if (!Array.isArray(values)) return fallback;
  const normalized = values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
  return normalized.length > 0 ? normalized : fallback;
}

async function fetchGeminiWithRetry(url: string, body: unknown): Promise<Response> {
  let lastResponse: Response | null = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_DELAYS[attempt - 1];
      const jitter = delay * 0.2 * (Math.random() * 2 - 1);
      await new Promise(r => setTimeout(r, Math.round(delay + jitter)));
    }
    lastResponse = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (lastResponse.ok || (lastResponse.status < 500 && lastResponse.status !== 429)) {
      return lastResponse;
    }
    if (attempt === RETRY_DELAYS.length) return lastResponse;
  }
  return lastResponse!;
}

async function readGeminiError(response: Response) {
  try {
    const data = await response.json();
    return data?.error?.message || "Gemini request failed.";
  } catch {
    return await response.text() || "Gemini request failed.";
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // SECURE: No customApiKey from client — server env only
    const { topic, platform, style, language = "hinglish" } = await req.json();
    const geminiApiKey =
      Deno.env.get("GEMINI_API_KEY") ||
      Deno.env.get("GOOGLE_AI_API_KEY") ||
      "";

    if (!geminiApiKey) {
      return jsonResponse({ success: false, error: "GEMINI_API_KEY not configured on server. Set via supabase secrets set GEMINI_API_KEY=...", action: "Contact admin." }, 500);
    }

    if (!topic || typeof topic !== 'string' || topic.trim().length < 3) {
      return jsonResponse({ success: false, error: "Topic is required and must be at least 3 characters.", action: "Enter a longer topic." }, 400);
    }

    if (topic.length > 500) {
      return jsonResponse({ success: false, error: "Topic too long. Maximum 500 characters allowed.", action: "Shorten your topic." }, 400);
    }

    const sanitizedTopic = topic.trim().slice(0, 500);
    
    let languageInstruction = "";
    switch (language.toLowerCase()) {
      case "hindi":
        languageInstruction = `CRITICAL LANGUAGE REQUIREMENT: Write EVERYTHING in pure Hindi (Devanagari script). Use Hindi idioms. Appeal to Indian audience.`;
        break;
      case "english":
        languageInstruction = `LANGUAGE: Write everything in fluent English. Use powerful vocabulary. Appeal to global audience.`;
        break;
      case "hinglish":
      default:
        languageInstruction = `CRITICAL LANGUAGE REQUIREMENT: Write EVERYTHING in Cinematic Hinglish (Romanized Hindi + English blend).
STYLE: Mix Hindi and English naturally. Use emotional Hindi words. Include dramatic pauses. Sound like popular Indian YouTubers.
TONE: Deep, emotional, slow narration - cinematic documentary style.`;
        break;
    }

    const systemPrompt = `You are a viral YouTube content strategist for Indian audiences.

${languageInstruction}

Generate content that creates instant curiosity, uses psychological triggers, and is optimized for YouTube algorithm.

Respond in exact JSON format (no markdown):
{
  "titles": ["title1", "title2", "title3", "title4", "title5"],
  "hooks": ["hook1", "hook2", "hook3", "hook4", "hook5", "hook6", "hook7", "hook8", "hook9", "hook10"],
  "script": "Full 60-second script - PURE NARRATION ONLY, no timestamps or markers",
  "hashtags": ["#hashtag1", "#hashtag2", "#hashtag3", "#hashtag4", "#hashtag5", "#hashtag6", "#hashtag7", "#hashtag8", "#hashtag9", "#hashtag10"],
  "description": "Full video description with SEO keywords"
}`;

    const userPrompt = `Generate viral YouTube content for:
Topic: ${sanitizedTopic}
Platform: ${platform || "YouTube"}
Style: ${style || "Dramatic"}
Language: ${language || "Hinglish"}

Requirements:
1. 5 viral titles with emojis
2. 10 short hooks (2-3 sentences)
3. CLEAN 60-second script - ONLY pure voiceover text (no timestamps, no markers)
4. 10 trending hashtags
5. SEO-optimized description

Script must be ready-to-read voiceover text.`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(geminiApiKey)}`;

    const response = await fetchGeminiWithRetry(geminiUrl, {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.9 },
    });

    if (!response.ok) {
      const errorMessage = await readGeminiError(response);
      if (response.status === 400 || response.status === 401 || response.status === 403) {
        return jsonResponse({ success: false, error: "Server Gemini key invalid or unauthorized.", action: "Admin: check server env GEMINI_API_KEY." }, 500);
      }
      if (response.status === 429) {
        return jsonResponse({ success: false, error: "Gemini rate limit exceeded after retries.", action: "Wait 30 seconds and try again." }, 429);
      }
      return jsonResponse({ success: false, error: errorMessage || "Gemini content generation failed.", action: "Try again in a moment." }, 500);
    }

    const data = await response.json();
    const content = extractGeminiText(data);
    
    if (!content) {
      return jsonResponse({ success: false, error: "Empty response from Gemini.", action: "Try again with a different topic." }, 502);
    }

    let parsedContent: any;
    try {
      parsedContent = JSON.parse(cleanupJson(content));
      if (!parsedContent.titles || !Array.isArray(parsedContent.titles) || parsedContent.titles.length === 0) {
        throw new Error("Invalid titles format");
      }
    } catch {
      parsedContent = {
        titles: [`🔥 ${topic} - You Won't Believe This!`],
        hooks: ["Kya tumne kabhi socha hai ki ye kaise hota hai?"],
        script: content || "Script generation in progress...",
        hashtags: [`#${topic.replace(/\s+/g, "")}`, "#viral", "#trending", "#youtube"],
        description: `${topic} ke baare mein jaano is amazing video mein!`
      };
    }

    return jsonResponse({
      titles: normalizeStringArray(parsedContent.titles, [`🔥 ${sanitizedTopic}`]).slice(0, 5),
      hooks: normalizeStringArray(parsedContent.hooks, ["Start with a shocking truth."]).slice(0, 10),
      script: typeof parsedContent.script === "string" && parsedContent.script.trim() ? parsedContent.script.trim() : content,
      hashtags: normalizeStringArray(parsedContent.hashtags, [`#${sanitizedTopic.replace(/\s+/g, "")}`, "#viral"]).slice(0, 10),
      description: typeof parsedContent.description === "string" && parsedContent.description.trim()
        ? parsedContent.description.trim()
        : `${sanitizedTopic} - high-retention script with SEO-ready description.`,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    return jsonResponse({ success: false, error: errorMessage, action: "Try again." }, 500);
  }
});
