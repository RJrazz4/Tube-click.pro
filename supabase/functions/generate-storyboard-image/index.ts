import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const HUGGINGFACE_API_URL = "https://api-inference.huggingface.co/models/stabilityai/sdxl-turbo";

async function generateImageWithHuggingFace(apiKey: string, prompt: string): Promise<string | null> {
  const response = await fetch(HUGGINGFACE_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ inputs: prompt }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('HuggingFace API error:', response.status, errorText);
    if (response.status === 429) {
      throw { status: 429, message: 'Rate limit exceeded' };
    }
    if (response.status === 503) {
      // Model loading - throw retryable error
      throw { status: 503, message: 'Model is loading, please retry' };
    }
    return null;
  }

  // HuggingFace returns raw image bytes
  const arrayBuffer = await response.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  
  // Convert to base64
  let binary = '';
  for (let i = 0; i < uint8Array.length; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  const base64 = btoa(binary);
  return `data:image/png;base64,${base64}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, sceneNumber } = await req.json();
    
    const HF_API_KEY = Deno.env.get('HUGGINGFACE_API_KEY');
    if (!HF_API_KEY) {
      throw new Error('HUGGINGFACE_API_KEY not configured');
    }

    if (!prompt) {
      return new Response(
        JSON.stringify({ error: 'Prompt is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Generating image for scene ${sceneNumber}: ${prompt.substring(0, 100)}...`);

    // Try up to 3 times with progressively simpler prompts
    const prompts = [
      prompt,
      `Cinematic photo, ${prompt.split(',').slice(0, 3).join(',')}`,
      `A photorealistic scene: ${prompt.split(',')[0]}`,
    ];

    for (let attempt = 0; attempt < prompts.length; attempt++) {
      console.log(`Attempt ${attempt + 1} for scene ${sceneNumber}`);
      try {
        const imageUrl = await generateImageWithHuggingFace(HF_API_KEY, prompts[attempt]);
        if (imageUrl) {
          console.log(`Success on attempt ${attempt + 1} for scene ${sceneNumber}`);
          return new Response(
            JSON.stringify({ imageUrl, sceneNumber }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } catch (e: any) {
        if (e.status === 429) {
          return new Response(
            JSON.stringify({ error: 'Rate limit exceeded. Please wait and try again.' }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        if (e.status === 503) {
          // Model loading - wait and retry
          console.log('Model loading, waiting 3s before retry...');
          await new Promise(r => setTimeout(r, 3000));
          continue;
        }
      }
      if (attempt < prompts.length - 1) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    return new Response(
      JSON.stringify({ error: 'Image generation failed after 3 attempts. Try a simpler description.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in generate-storyboard-image:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
