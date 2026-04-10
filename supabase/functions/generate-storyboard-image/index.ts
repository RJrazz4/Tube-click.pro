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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, sceneNumber, customApiKey } = await req.json();

    const FAL_API_KEY = (typeof customApiKey === "string" ? customApiKey.trim() : "") || Deno.env.get('FAL_API_KEY') || "";
    if (!FAL_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: 'Image API key not configured.', action: 'Add your Fal.ai key in Settings.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!prompt) {
      return new Response(
        JSON.stringify({ success: false, error: 'Prompt is required.', action: 'Enter a description for the image.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const response = await fetchFalWithRetry('https://queue.fal.run/fal-ai/fast-lightning-sdxl', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        image_size: 'landscape_16_9',
        num_inference_steps: 4,
        num_images: 1,
        enable_safety_checker: false,
      }),
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid Fal.ai API key.', action: 'Check and update your Fal.ai API key in Settings.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ success: false, error: 'Fal.ai rate limit exceeded.', action: 'Wait a moment and try again.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await response.text();
      return new Response(
        JSON.stringify({ success: false, error: `Image API error: ${response.status}`, action: 'Try again or check your API key.' }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const queueData = await response.json();
    const requestId = queueData.request_id;

    if (!requestId) {
      throw new Error('No request_id returned from image API');
    }

    // Poll for result (max 30 seconds)
    const maxWait = 30000;
    const pollInterval = 1000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      await new Promise(r => setTimeout(r, pollInterval));

      const statusRes = await fetch(
        `https://queue.fal.run/fal-ai/fast-lightning-sdxl/requests/${requestId}/status`,
        { headers: { 'Authorization': `Key ${FAL_API_KEY}` } }
      );

      if (!statusRes.ok) continue;

      const statusData = await statusRes.json();

      if (statusData.status === 'COMPLETED') {
        const resultRes = await fetch(
          `https://queue.fal.run/fal-ai/fast-lightning-sdxl/requests/${requestId}`,
          { headers: { 'Authorization': `Key ${FAL_API_KEY}` } }
        );

        if (!resultRes.ok) {
          throw new Error('Failed to fetch result from image API');
        }

        const resultData = await resultRes.json();
        const imageUrl = resultData.images?.[0]?.url;

        if (!imageUrl) {
          throw new Error('No image URL in response');
        }

        return new Response(
          JSON.stringify({ imageUrl, sceneNumber }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (statusData.status === 'FAILED') {
        throw new Error('Image generation failed');
      }
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Image generation timed out.', action: 'Try again.' }),
      { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage, action: 'Try again or check your API key.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
