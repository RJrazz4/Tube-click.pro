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
      return jsonResponse({ success: false, error: "Gemini API key not configured.", action: "Add your Gemini key in Settings." }, 400);
    }

    if (!images || !Array.isArray(images) || images.length === 0) {
      return jsonResponse({ success: false, error: "No images provided.", action: "Upload at least one screenshot." }, 400);
    }

    if (images.length > 10) {
      return jsonResponse({ success: false, error: "Too many images. Maximum 10.", action: "Remove some images." }, 400);
    }

    const content = [
      {
        type: "text",
        text: `You are an expert technical writer. Analyze these screenshots and create a comprehensive, step-by-step tutorial guide in clean Markdown.`
      },
      ...images.map((imageData: string) => toInlineData(imageData))
    ];

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(geminiApiKey)}`;

    const response = await fetchGeminiWithRetry(geminiUrl, {
      contents: [{ role: "user", parts: content }],
      generationConfig: { temperature: 0.4 },
    });

    if (!response.ok) {
      const errorMessage = await readGeminiError(response);

      if (response.status === 400 || response.status === 401 || response.status === 403) {
        return jsonResponse({ success: false, error: "Invalid Gemini API key or access denied.", action: "Update your key in Settings." }, 401);
      }
      if (response.status === 429) {
        return jsonResponse({ success: false, error: "Gemini rate limit exceeded after retries.", action: "Wait 30 seconds and try again." }, 429);
      }

      return jsonResponse({ success: false, error: errorMessage, action: "Try again in a moment." }, 500);
    }

    const data = await response.json();
    const guide = extractGeminiText(data) || "";

    if (!guide.trim()) {
      return jsonResponse({ success: false, error: "Empty response from Gemini.", action: "Try again." }, 502);
    }

    return jsonResponse({ guide });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ success: false, error: errorMessage, action: "Try again or check your API key." }, 500);
  }
});
