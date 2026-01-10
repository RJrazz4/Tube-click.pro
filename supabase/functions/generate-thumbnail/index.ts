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
    const { title, emotion, style, aspectRatio, count = 4 } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    if (!title) {
      throw new Error("Title is required");
    }

    const dimensions = aspectRatio === "9:16" 
      ? { width: 1080, height: 1920, ratio: "9:16" }
      : { width: 1280, height: 720, ratio: "16:9" };

    console.log("Generating", count, "thumbnails for:", title);

    // Create enhanced prompt for better thumbnails
    const basePrompt = `YouTube thumbnail, professional, high quality, ${dimensions.ratio} aspect ratio, vibrant colors, eye-catching, ${emotion || "exciting"}, ${style || "modern"}, centered composition, clean design, no text overlay needed, ${title}`;

    // Generate multiple variations
    const thumbnailPromises = [];
    const variations = [
      "dramatic lighting, bold colors, cinematic",
      "minimalist, clean, modern aesthetic",
      "energetic, dynamic, action-packed",
      "mysterious, intriguing, dark tones"
    ];

    for (let i = 0; i < Math.min(count, 4); i++) {
      const prompt = `${basePrompt}, ${variations[i]}`;
      
      thumbnailPromises.push(
        fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-image-preview",
            messages: [
              {
                role: "user",
                content: prompt
              }
            ],
            modalities: ["image", "text"]
          }),
        }).then(async (response) => {
          if (!response.ok) {
            console.error("Image generation failed:", response.status);
            return null;
          }
          const data = await response.json();
          const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
          return imageUrl;
        }).catch((error) => {
          console.error("Error generating image:", error);
          return null;
        })
      );
    }

    const results = await Promise.all(thumbnailPromises);
    const thumbnails = results.filter(Boolean);

    console.log("Generated", thumbnails.length, "thumbnails successfully");

    return new Response(JSON.stringify({ thumbnails, dimensions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error in generate-thumbnail function:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
