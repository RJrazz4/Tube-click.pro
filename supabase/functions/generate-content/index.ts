import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GEMINI_MODEL = "gemini-2.0-flash";

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
    const { topic, platform, style, language = "hinglish", customApiKey } = await req.json();
    const geminiApiKey =
      (typeof customApiKey === "string" ? customApiKey.trim() : "") ||
      Deno.env.get("GEMINI_API_KEY") ||
      Deno.env.get("GOOGLE_AI_API_KEY") ||
      "";

    if (!geminiApiKey) {
      return jsonResponse({ error: "Gemini API key not configured. Add your key in Settings to generate content." }, 400);
    }

    if (!topic || typeof topic !== 'string' || topic.trim().length < 3) {
      return jsonResponse({ error: "Topic is required and must be at least 3 characters." }, 400);
    }

    if (topic.length > 500) {
      return jsonResponse({ error: "Topic too long. Maximum 500 characters allowed." }, 400);
    }

    const sanitizedTopic = topic.trim().slice(0, 500);
    
    // Language instruction based on selection
    let languageInstruction = "";
    switch (language.toLowerCase()) {
      case "hindi":
        languageInstruction = `
CRITICAL LANGUAGE REQUIREMENT: Write EVERYTHING in pure Hindi (Devanagari script).
- All titles, hooks, script, and description must be in Hindi
- Use Hindi idioms and expressions
- Appeal to Indian audience emotions`;
        break;
      case "english":
        languageInstruction = `
LANGUAGE: Write everything in fluent English.
- Use powerful English vocabulary
- Appeal to global audience`;
        break;
      case "hinglish":
      default:
        languageInstruction = `
CRITICAL LANGUAGE REQUIREMENT: Write EVERYTHING in Cinematic Hinglish.
Hinglish = Natural blend of Hindi + English (Romanized Hindi script, not Devanagari)

HINGLISH STYLE RULES:
- Mix Hindi and English naturally: "Yaar, ye story tumhari zindagi change kar degi"
- Use emotional Hindi words: "dard", "pyaar", "sapna", "takleef", "himmat"
- Include dramatic pauses: "Aur phir... kuch aisa hua jo maine kabhi socha nahi tha"
- Use relatable Indian expressions: "Bhai", "Yaar", "Arre", "Dekho"
- Write like you're telling a story to a friend
- Make it sound like popular Indian YouTubers (Dhruv Rathee, Sandeep Maheshwari style)

TONE: Deep, emotional, slow narration - like a cinematic documentary
- Build suspense slowly
- Use dramatic pauses with "..."
- Create emotional connection with viewers
- Sound philosophical and thoughtful`;
        break;
    }

    const systemPrompt = `You are a viral YouTube content strategist specializing in creating high-retention, emotionally powerful content for Indian audiences.

${languageInstruction}

Your task is to generate content that:
- Creates instant curiosity and hooks viewers in the first 3 seconds
- Uses psychological triggers like mystery, controversy, transformation
- Is optimized for YouTube algorithm (CTR, watch time, engagement)
- Appeals deeply to emotions and creates FOMO
- Sounds natural and conversational, not robotic

You MUST respond in the following exact JSON format (no markdown, just raw JSON):
{
  "titles": ["title1", "title2", "title3", "title4", "title5"],
  "hooks": ["hook1", "hook2", "hook3", "hook4", "hook5", "hook6", "hook7", "hook8", "hook9", "hook10"],
  "script": "Full 60-second script - PURE NARRATION ONLY, no timestamps or markers",
  "hashtags": ["#hashtag1", "#hashtag2", "#hashtag3", "#hashtag4", "#hashtag5", "#hashtag6", "#hashtag7", "#hashtag8", "#hashtag9", "#hashtag10"],
  "description": "Full video description with SEO keywords"
}`;

    const userPrompt = `Generate viral YouTube content for the following:
Topic: ${sanitizedTopic}
Platform: ${platform || "YouTube"}
Style: ${style || "Dramatic"}
Language: ${language || "Hinglish"}

Requirements:
1. Generate 5 viral, clickbait (but honest) YouTube titles with emojis - ${language === "hinglish" ? "in Hinglish" : language === "hindi" ? "in Hindi" : "in English"}
2. Generate 10 short hooks (2-3 sentences each) for Shorts that create instant curiosity
3. Write a CLEAN 60-second script - ONLY pure voiceover narration text:
   - NO timestamps like [00:00] or [0:15]
   - NO production markers like [B-ROLL], [CUT TO], [TRANSITION]
   - NO camera directions
   - ONLY the words that will be spoken
   - Deep, emotional, slow-paced narration style
4. Generate 10 trending hashtags relevant to the topic
5. Write an SEO-optimized video description

IMPORTANT: The script must be ready-to-read voiceover text. No editing needed.
Make content highly engaging with power words and emotional triggers.`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(geminiApiKey)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: userPrompt }],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.9,
        },
      }),
    });

    if (!response.ok) {
      const errorMessage = await readGeminiError(response);

      if (response.status === 400 || response.status === 401 || response.status === 403) {
        return jsonResponse({ error: "Invalid Gemini API key or access denied. Update your key in Settings." }, 401);
      }
      if (response.status === 429) {
        return jsonResponse({ error: "Gemini rate limit exceeded. Please wait and try again." }, 429);
      }

      return jsonResponse({ error: errorMessage || "Gemini content generation failed." }, 500);
    }

    const data = await response.json();
    const content = extractGeminiText(data);
    
    if (!content) {
      return jsonResponse({ error: "Empty response from Gemini. Please try again." }, 502);
    }

    let parsedContent: any;
    try {
      parsedContent = JSON.parse(cleanupJson(content));

      if (!parsedContent.titles || !Array.isArray(parsedContent.titles) || parsedContent.titles.length === 0) {
        throw new Error("Invalid titles format");
      }
    } catch {
      parsedContent = {
        titles: [`🔥 ${topic} - Ye Dekho! You Won't Believe This!`],
        hooks: ["Kya tumne kabhi socha hai ki ye kaise hota hai? Aaj main tumhe bataunga..."],
        script: content || "Script generation in progress...",
        hashtags: [`#${topic.replace(/\s+/g, "")}`, "#viral", "#trending", "#india", "#youtube"],
        description: `${topic} ke baare mein jaano is amazing video mein!`
      };
    }

    return jsonResponse({
      titles: normalizeStringArray(parsedContent.titles, [`🔥 ${sanitizedTopic}`]).slice(0, 5),
      hooks: normalizeStringArray(parsedContent.hooks, ["Start with a shocking truth, then reveal the full story."]).slice(0, 10),
      script: typeof parsedContent.script === "string" && parsedContent.script.trim() ? parsedContent.script.trim() : content,
      hashtags: normalizeStringArray(parsedContent.hashtags, [`#${sanitizedTopic.replace(/\s+/g, "")}`, "#viral", "#youtube"]).slice(0, 10),
      description:
        typeof parsedContent.description === "string" && parsedContent.description.trim()
          ? parsedContent.description.trim()
          : `${sanitizedTopic} explained with a high-retention script and SEO-ready description.`,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    return jsonResponse({ error: errorMessage }, 500);
  }
});
