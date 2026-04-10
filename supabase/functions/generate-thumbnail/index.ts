import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RETRY_DELAYS = [2000, 5000];

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getDimensions(aspectRatio: string) {
  return aspectRatio === "9:16"
    ? { width: 1080, height: 1920, ratio: "9:16", falSize: "portrait_16_9" }
    : { width: 1280, height: 720, ratio: "16:9", falSize: "landscape_16_9" };
}

function buildPrompt(title: string, emotion: string, style: string, ratio: string, variation: string) {
  return [
    `YouTube thumbnail concept for: ${title}`,
    `${emotion || "Exciting"} emotion`,
    `${style || "Modern"} style`,
    `${ratio} aspect ratio`,
    variation,
    "single dominant subject, bold composition, high contrast cinematic lighting, vibrant color separation, professional YouTube thumbnail aesthetic, no text, no watermark, ultra detailed",
  ].join(", ");
}

async function generateThumbnail(prompt: string, apiKey: string, falSize: string): Promise<string> {
  let lastError = "Thumbnail generation failed.";

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt - 1]));
    }

    const submitResponse = await fetch("https://queue.fal.run/fal-ai/fast-lightning-sdxl", {
      method: "POST",
      headers: {
        Authorization: `Key ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        image_size: falSize,
        num_inference_steps: 4,
        num_images: 1,
        enable_safety_checker: false,
      }),
    });

    if (submitResponse.status === 401 || submitResponse.status === 403) {
      throw { status: 401, message: "Invalid Fal.ai API key." };
    }

    if (!submitResponse.ok) {
      if (submitResponse.status === 429 && attempt < RETRY_DELAYS.length) continue;
      lastError = `Fal.ai error: ${submitResponse.status}`;
      if (attempt === RETRY_DELAYS.length) throw { status: submitResponse.status, message: lastError };
      continue;
    }

    const queueData = await submitResponse.json();
    const requestId = queueData?.request_id;

    if (!requestId) {
      throw { status: 502, message: "No request ID returned by Fal.ai." };
    }

    const startedAt = Date.now();

    while (Date.now() - startedAt < 30000) {
      await new Promise(r => setTimeout(r, 1000));

      const statusResponse = await fetch(
        `https://queue.fal.run/fal-ai/fast-lightning-sdxl/requests/${requestId}/status`,
        { headers: { Authorization: `Key ${apiKey}` } },
      );

      if (!statusResponse.ok) continue;

      const statusData = await statusResponse.json();

      if (statusData.status === "COMPLETED") {
        const resultResponse = await fetch(
          `https://queue.fal.run/fal-ai/fast-lightning-sdxl/requests/${requestId}`,
          { headers: { Authorization: `Key ${apiKey}` } },
        );

        if (!resultResponse.ok) {
          throw { status: resultResponse.status, message: "Failed to fetch result." };
        }

        const resultData = await resultResponse.json();
        const imageUrl = resultData?.images?.[0]?.url;

        if (!imageUrl) {
          throw { status: 502, message: "No image URL returned." };
        }

        return imageUrl;
      }

      if (statusData.status === "FAILED") {
        throw { status: 502, message: "Image generation failed on Fal.ai." };
      }
    }

    throw { status: 504, message: "Thumbnail generation timed out." };
  }

  throw { status: 500, message: lastError };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { title, emotion, style, aspectRatio = "16:9", count = 4, customApiKey } = await req.json();
    const falApiKey =
      (typeof customApiKey === "string" ? customApiKey.trim() : "") ||
      Deno.env.get("FAL_API_KEY") ||
      "";

    if (!falApiKey) {
      return jsonResponse({ success: false, error: "Fal.ai API key not configured.", action: "Add your Fal.ai key in Settings." }, 400);
    }

    if (!title || typeof title !== 'string' || title.trim().length < 3) {
      return jsonResponse({ success: false, error: "Title required (min 3 chars).", action: "Enter a longer title." }, 400);
    }

    if (title.length > 200) {
      return jsonResponse({ success: false, error: "Title too long (max 200).", action: "Shorten your title." }, 400);
    }

    const dimensions = getDimensions(aspectRatio);
    const variations = [
      "dramatic lighting, bold colors, cinematic",
      "minimalist, clean, modern aesthetic",
      "energetic, dynamic, action-packed",
      "mysterious, intriguing, dark tones"
    ];

    const results = await Promise.all(
      variations.slice(0, Math.min(count, 4)).map(async (variation) => {
        try {
          const imageUrl = await generateThumbnail(
            buildPrompt(title.trim(), emotion || "Exciting", style || "Modern", dimensions.ratio, variation),
            falApiKey,
            dimensions.falSize,
          );
          return { imageUrl, status: 200 };
        } catch (error: any) {
          return { imageUrl: null, status: error.status || 500, error: error.message || "Failed." };
        }
      }),
    );

    const thumbnails = results.map((r) => r.imageUrl);
    const successCount = thumbnails.filter(Boolean).length;

    if (successCount === 0) {
      const firstFailure = results.find((r) => r.error);

      if (firstFailure?.status === 401 || firstFailure?.status === 403) {
        return jsonResponse({ success: false, error: "Invalid Fal.ai API key.", action: "Update your key in Settings." }, 401);
      }
      if (firstFailure?.status === 429) {
        return jsonResponse({ success: false, error: "Fal.ai rate limit exceeded.", action: "Wait and try again." }, 429);
      }

      return jsonResponse({ success: false, error: firstFailure?.error || "Generation failed.", action: "Try again." }, firstFailure?.status || 502);
    }

    return jsonResponse({ thumbnails, dimensions: { width: dimensions.width, height: dimensions.height, ratio: dimensions.ratio } });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ success: false, error: errorMessage, action: "Try again." }, 500);
  }
});
