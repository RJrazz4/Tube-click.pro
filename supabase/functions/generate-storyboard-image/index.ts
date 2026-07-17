import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RETRY_DELAYS = [2000, 5000];

async function fetchFalWithRetry(url: string, options: RequestInit): Promise<Response> {
  let lastResponse: Response | null = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_DELAYS[attempt - 1];
      await new Promise(r => setTimeout(r, delay));
    }
    lastResponse = await fetch(url, options);
    if (lastResponse.ok || (lastResponse.status < 500 && lastResponse.status !== 429)) {
      return lastResponse;
    }
    if (attempt === RETRY_DELAYS.length) return lastResponse;
  }
  return lastResponse!;
}

function buildPollinationsFallback(prompt: string, seed: number): string {
  const enc = encodeURIComponent(prompt);
  return `https://image.pollinations.ai/prompt/${enc}?width=1280&height=720&nologo=true&seed=${seed}&model=flux`;
}

function buildSnapGenFallback(prompt: string, seed: number): string {
  const enc = encodeURIComponent(prompt);
  return `https://image.pollinations.ai/prompt/${enc}?width=1280&height=720&nologo=true&seed=${seed + 1000}&model=turbo&enhance=true`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { prompt, sceneNumber, brand = "Tube.Cinematic" } = await req.json();

    if (!prompt) {
      return new Response(
        JSON.stringify({ success: false, error: 'Prompt is required.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const falApiKey = Deno.env.get('FAL_API_KEY') || "";
    const snapgenKey = Deno.env.get('SNAPGEN_API_KEY') || "";

    // Brand mapping logic: Tube.Flash (Pollinations free) / Tube.Pro (SnapGen) / Tube.Cinematic (Fal.ai premium)
    const selectedBrand = brand as string;

    // If Fal key not set or brand is Flash/Pro and we want fast free path, use fallback with white-label

    // Try Fal.ai first if key exists and brand is Cinematic or Pro with Fal fallback
    if (falApiKey && (selectedBrand === 'Tube.Cinematic' || selectedBrand === 'Tube.Pro')) {
      try {
        const response = await fetchFalWithRetry('https://queue.fal.run/fal-ai/fast-lightning-sdxl', {
          method: 'POST',
          headers: { 'Authorization': `Key ${falApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            image_size: 'landscape_16_9',
            num_inference_steps: 4,
            num_images: 1,
            enable_safety_checker: false,
          }),
        });

        if (response.ok) {
          const queueData = await response.json();
          const requestId = queueData.request_id;
          if (requestId) {
            const maxWait = 30000;
            const startTime = Date.now();
            while (Date.now() - startTime < maxWait) {
              await new Promise(r => setTimeout(r, 1000));
              const statusRes = await fetch(`https://queue.fal.run/fal-ai/fast-lightning-sdxl/requests/${requestId}/status`, { headers: { 'Authorization': `Key ${falApiKey}` } });
              if (!statusRes.ok) continue;
              const statusData = await statusRes.json();
              if (statusData.status === 'COMPLETED') {
                const resultRes = await fetch(`https://queue.fal.run/fal-ai/fast-lightning-sdxl/requests/${requestId}`, { headers: { 'Authorization': `Key ${falApiKey}` } });
                if (resultRes.ok) {
                  const resultData = await resultRes.json();
                  const imageUrl = resultData.images?.[0]?.url;
                  if (imageUrl) {
                    return new Response(JSON.stringify({ imageUrl, sceneNumber, brand: selectedBrand, provider: 'fal' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
                  }
                }
              }
              if (statusData.status === 'FAILED') break;
            }
          }
        }
      } catch {}
      // Fall through to SnapGen/Pollinations fallback if Fal fails
    }

    // SnapGen path — try real API if key, else turbo enhanced fallback (white-labeled as Tube.Pro)
    if (selectedBrand === 'Tube.Pro' || selectedBrand === 'Tube.Cinematic') {
      if (snapgenKey) {
        try {
          const res = await fetch('https://api.snapgen.io/v1/images/generations', {
            method: 'POST',
            headers: { Authorization: `Bearer ${snapgenKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, width: 1280, height: 720, n: 1 }),
          });
          if (res.ok) {
            const data = await res.json();
            const url = data.data?.[0]?.url || data.url;
            if (url) return new Response(JSON.stringify({ imageUrl: url, sceneNumber, brand: selectedBrand, provider: 'snapgen' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }
        } catch {}
      }
      // Free SnapGen white-label fallback
      const snapUrl = buildSnapGenFallback(prompt, Date.now() + sceneNumber * 123);
      return new Response(JSON.stringify({ imageUrl: snapUrl, sceneNumber, brand: selectedBrand, provider: 'snapgen-fallback' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Tube.Flash — Pollinations flux free
    const fallbackUrl = buildPollinationsFallback(prompt, Date.now() + sceneNumber * 456);
    return new Response(JSON.stringify({ imageUrl: fallbackUrl, sceneNumber, brand: selectedBrand, provider: 'pollinations' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    // Final fallback — even on error, return Pollinations to avoid breaking UI
    try {
      const { prompt, sceneNumber, brand } = await error as any;
      if (prompt) {
        const fallback = buildPollinationsFallback(prompt, Date.now());
        return new Response(JSON.stringify({ imageUrl: fallback, sceneNumber, brand, provider: 'pollinations-error-fallback' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    } catch {}
    return new Response(JSON.stringify({ success: false, error: msg }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
