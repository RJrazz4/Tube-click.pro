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

async function readGeminiError(response: Response) {
  try {
    const data = await response.json();
    return data?.error?.message || "Gemini request failed.";
  } catch {
    return await response.text() || "Gemini request failed.";
  }
}

function toInlineData(imageData: string) {
  const matches = imageData.match(/^data:(.*?);base64,(.*)$/);

  if (!matches) {
    throw new Error("Invalid image format. Please upload valid screenshots.");
  }

  return {
    inlineData: {
      mimeType: matches[1],
      data: matches[2],
    },
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { images, customApiKey } = await req.json();
    const geminiApiKey =
      (typeof customApiKey === "string" ? customApiKey.trim() : "") ||
      Deno.env.get("GEMINI_API_KEY") ||
      Deno.env.get("GOOGLE_AI_API_KEY") ||
      "";

    if (!geminiApiKey) {
      return jsonResponse({ error: "Gemini API key not configured. Add your key in Settings to generate guides." }, 400);
    }

    if (!images || !Array.isArray(images) || images.length === 0) {
      return jsonResponse({ error: "No images provided. Please upload at least one screenshot." }, 400);
    }

    if (images.length > 10) {
      return jsonResponse({ error: "Too many images. Maximum 10 screenshots allowed." }, 400);
    }

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
      ...images.map((imageData: string) => toInlineData(imageData))
    ];

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(geminiApiKey)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: content,
          }
        ],
        generationConfig: {
          temperature: 0.4,
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

      return jsonResponse({ error: errorMessage || "Vision guide generation failed." }, 500);
    }

    const data = await response.json();
    const guide = extractGeminiText(data) || "";

    if (!guide.trim()) {
      return jsonResponse({ error: "Empty response from Gemini. Please try again." }, 502);
    }

    return jsonResponse({ guide });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ error: errorMessage }, 500);
  }
});
