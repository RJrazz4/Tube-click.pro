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
    const { images } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    if (!images || images.length === 0) {
      throw new Error("No images provided");
    }

    console.log("Processing", images.length, "images for vision guide");

    // Build the content array with images
    const content = [
      {
        type: "text",
        text: `You are an expert technical writer. Analyze these screenshots and create a comprehensive, step-by-step tutorial guide.

Your guide MUST include:
1. A clear title for the tutorial
2. An overview/introduction explaining what will be accomplished
3. Prerequisites (if any visible)
4. Numbered step-by-step instructions with:
   - Clear action descriptions (what to click, where to navigate)
   - Expected results after each step
   - Pro tips or warnings where helpful
5. A summary/conclusion

Format the output in clean Markdown with:
- # for main title
- ## for section headers
- ### for sub-sections
- **Bold** for important buttons/elements to click
- \`code\` for any code or technical terms
- > for tips and notes
- Numbered lists for steps

Be detailed, clear, and beginner-friendly. Assume the reader is seeing this interface for the first time.`
      },
      ...images.map((imageData: string) => ({
        type: "image_url",
        image_url: {
          url: imageData
        }
      }))
    ];

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: content
          }
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
    const guide = data.choices?.[0]?.message?.content || "Failed to generate guide";

    console.log("Guide generated successfully, length:", guide.length);

    return new Response(JSON.stringify({ guide }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error in vision-guide function:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
