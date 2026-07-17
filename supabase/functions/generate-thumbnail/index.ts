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
    "single dominant subject, bold composition, high contrast cinematic lighting, vibrant color separation, professional YouTube thumbnail aesthetic, no text, no watermark, ultra detailed, 8K",
  ].join(", ");
}

async function generateFalThumbnail(prompt: string, falSize: string): Promise<string | null> {
  const falApiKey = Deno.env.get("FAL_API_KEY") || "";
  if (!falApiKey) return null;

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt - 1]));
    try {
      const submitResponse = await fetch("https://queue.fal.run/fal-ai/fast-lightning-sdxl", {
        method: "POST",
        headers: { Authorization: `Key ${falApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, image_size: falSize, num_inference_steps: 4, num_images: 1, enable_safety_checker: false }),
      });
      if (!submitResponse.ok) {
        if (submitResponse.status === 429 && attempt < RETRY_DELAYS.length) continue;
        continue;
      }
      const queueData = await submitResponse.json();
      const requestId = queueData?.request_id;
      if (!requestId) continue;

      const startedAt = Date.now();
      while (Date.now() - startedAt < 28000) {
        await new Promise(r => setTimeout(r, 1000));
        const statusResponse = await fetch(`https://queue.fal.run/fal-ai/fast-lightning-sdxl/requests/${requestId}/status`, { headers: { Authorization: `Key ${falApiKey}` } });
        if (!statusResponse.ok) continue;
        const statusData = await statusResponse.json();
        if (statusData.status === "COMPLETED") {
          const resultResponse = await fetch(`https://queue.fal.run/fal-ai/fast-lightning-sdxl/requests/${requestId}`, { headers: { Authorization: `Key ${falApiKey}` } });
          if (!resultResponse.ok) continue;
          const resultData = await resultResponse.json();
          const imageUrl = resultData?.images?.[0]?.url;
          if (imageUrl) return imageUrl;
        }
        if (statusData.status === "FAILED") break;
      }
    } catch {}
  }
  return null;
}

function buildPollinationsUrl(prompt: string, width: number, height: number, seed: number, model: string = "flux", enhance = false) {
  const encoded = encodeURIComponent(prompt);
  const enhanceParam = enhance ? "&enhance=true" : "";
  return `https://image.pollinations.ai/prompt/${encoded}?width=${width}&height=${height}&nologo=true&seed=${seed}&model=${model}${enhanceParam}`;
}

// SnapGen white-label: uses Pollinations turbo enhanced for free tier, or real SnapGen API if key provided
async function generateSnapGen(prompt: string, width: number, height: number, seed: number): Promise<string> {
  const snapgenKey = Deno.env.get("SNAPGEN_API_KEY") || "";
  if (snapgenKey) {
    try {
      const res = await fetch("https://api.snapgen.io/v1/images/generations", {
        method: "POST",
        headers: { Authorization: `Bearer ${snapgenKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, width, height, n: 1, model: "snapgen-v1" }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.data?.[0]?.url) return data.data[0].url;
        if (data.url) return data.url;
      }
    } catch {}
  }
  // Free fallback: Pollinations turbo enhanced — white-labeled as SnapGen Tube.Pro
  return buildPollinationsUrl(prompt, width, height, seed + 1000, "turbo", true);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { title, emotion, style, aspectRatio = "16:9", count = 4, brand = "Tube.Pro" } = await req.json();

    if (!title || typeof title !== 'string' || title.trim().length < 3) {
      return jsonResponse({ error: "Title required (min 3 chars)." }, 400);
    }
    if (title.length > 200) return jsonResponse({ error: "Title too long (max 200)." }, 400);

    const dimensions = getDimensions(aspectRatio);
    const variations = [
      "dramatic lighting, bold colors, cinematic, high contrast",
      "minimalist, clean, modern aesthetic, vibrant",
      "energetic, dynamic, action-packed, eye-catching",
      "mysterious, intriguing, dark tones, cinematic glow",
    ];

    const selectedBrand = (brand as string) || "Tube.Pro";
    const thumbnails: (string | null)[] = [];

    for (let i = 0; i < Math.min(count, 4); i++) {
      const variation = variations[i];
      const fullPrompt = buildPrompt(title.trim(), emotion || "Exciting", style || "Modern", dimensions.ratio, variation);
      const seed = Date.now() + i * 12345;

      if (selectedBrand === "Tube.Flash") {
        thumbnails.push(buildPollinationsUrl(fullPrompt, dimensions.width, dimensions.height, seed, "flux", false));
      } else if (selectedBrand === "Tube.Pro") {
        const snapUrl = await generateSnapGen(fullPrompt, dimensions.width, dimensions.height, seed);
        thumbnails.push(snapUrl);
      } else if (selectedBrand === "Tube.Cinematic") {
        const falUrl = await generateFalThumbnail(fullPrompt, dimensions.falSize);
        if (falUrl) thumbnails.push(falUrl);
        else {
          const snapUrl = await generateSnapGen(fullPrompt, dimensions.width, dimensions.height, seed);
          thumbnails.push(snapUrl);
        }
      } else {
        const snapUrl = await generateSnapGen(fullPrompt, dimensions.width, dimensions.height, seed);
        thumbnails.push(snapUrl);
      }
    }

    const successCount = thumbnails.filter(Boolean).length;
    if (successCount === 0) return jsonResponse({ error: "All thumbnails failed" }, 502);

    return jsonResponse({
      thumbnails,
      dimensions: { width: dimensions.width, height: dimensions.height, ratio: dimensions.ratio },
      brand: selectedBrand,
      providerMap: {
        "Tube.Flash": "pollinations (flux, free)",
        "Tube.Pro": "snapgen (turbo enhanced, free, white-labeled)",
        "Tube.Cinematic": "fal-ai/fast-lightning-sdxl (premium, fallback snapgen)",
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ error: msg }, 500);
  }
});
