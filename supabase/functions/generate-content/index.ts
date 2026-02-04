import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { topic, platform, style, language = "hinglish" } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      return new Response(JSON.stringify({ error: "Server configuration error. Please contact support." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Input validation
    if (!topic || typeof topic !== 'string' || topic.trim().length < 3) {
      return new Response(JSON.stringify({ error: "Topic is required and must be at least 3 characters." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (topic.length > 500) {
      return new Response(JSON.stringify({ error: "Topic too long. Maximum 500 characters allowed." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

    console.log(`Generating ${language} content for topic:`, sanitizedTopic);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please wait 30 seconds and try again." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted. Please add funds to your workspace." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI service temporarily unavailable. Please try again.`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error("Empty response from AI. Please try again.");
    }
    
    console.log("AI response received:", content?.substring(0, 200));

    // Parse the JSON response
    let parsedContent;
    try {
      // Try to extract JSON from the response (handle markdown code blocks)
      let jsonStr = content;
      if (content.includes("```json")) {
        jsonStr = content.split("```json")[1].split("```")[0];
      } else if (content.includes("```")) {
        jsonStr = content.split("```")[1].split("```")[0];
      }
      parsedContent = JSON.parse(jsonStr.trim());
      
      // Validate required fields
      if (!parsedContent.titles || !Array.isArray(parsedContent.titles) || parsedContent.titles.length === 0) {
        throw new Error("Invalid titles format");
      }
    } catch (e) {
      console.error("Failed to parse AI response as JSON:", e);
      // Return a structured fallback with the raw content
      parsedContent = {
        titles: [`🔥 ${topic} - Ye Dekho! You Won't Believe This!`],
        hooks: ["Kya tumne kabhi socha hai ki ye kaise hota hai? Aaj main tumhe bataunga..."],
        script: content || "Script generation in progress...",
        hashtags: [`#${topic.replace(/\s+/g, "")}`, "#viral", "#trending", "#india", "#youtube"],
        description: `${topic} ke baare mein jaano is amazing video mein!`
      };
    }

    return new Response(JSON.stringify(parsedContent), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error in generate-content function:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
