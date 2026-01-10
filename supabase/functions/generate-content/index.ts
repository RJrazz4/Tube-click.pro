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
    const { topic, platform, style } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `You are a viral YouTube content strategist specializing in creating high-retention, curiosity-based content for Indian and global audiences.

Your task is to generate content that:
- Creates instant curiosity and hook viewers in the first 3 seconds
- Uses psychological triggers like mystery, controversy, transformation
- Is optimized for YouTube algorithm (CTR, watch time, engagement)
- Appeals to emotions and creates FOMO

You MUST respond in the following exact JSON format (no markdown, just raw JSON):
{
  "titles": ["title1", "title2", "title3", "title4", "title5"],
  "hooks": ["hook1", "hook2", "hook3", "hook4", "hook5", "hook6", "hook7", "hook8", "hook9", "hook10"],
  "script": "Full 60-second script with timestamps",
  "hashtags": ["#hashtag1", "#hashtag2", "#hashtag3", "#hashtag4", "#hashtag5", "#hashtag6", "#hashtag7", "#hashtag8", "#hashtag9", "#hashtag10"],
  "description": "Full video description with SEO keywords"
}`;

    const userPrompt = `Generate viral YouTube content for the following:
Topic: ${topic}
Platform: ${platform || "YouTube"}
Style: ${style || "Engaging and energetic"}

Requirements:
1. Generate 5 viral, clickbait (but honest) YouTube titles with emojis
2. Generate 10 short hooks (2-3 sentences each) for Shorts that create instant curiosity
3. Write a full 60-second script with [TIMESTAMPS], [B-ROLL SUGGESTIONS], and [TRANSITIONS]
4. Generate 10 trending hashtags relevant to the topic
5. Write an SEO-optimized video description with keywords, timestamps, and call-to-action

Make content highly engaging, use power words, create curiosity gaps, and optimize for maximum retention.`;

    console.log("Generating content for topic:", topic);

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
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required. Please add credits to your workspace." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
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
    } catch (e) {
      console.error("Failed to parse AI response as JSON:", e);
      // Return a structured error with the raw content for debugging
      parsedContent = {
        titles: [`🔥 ${topic} - You Won't Believe This!`],
        hooks: ["What if I told you everything you knew was wrong?"],
        script: content || "Script generation in progress...",
        hashtags: [`#${topic.replace(/\s+/g, "")}`, "#viral", "#trending"],
        description: `Learn about ${topic} in this amazing video!`
      };
    }

    return new Response(JSON.stringify(parsedContent), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error in generate-content function:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
