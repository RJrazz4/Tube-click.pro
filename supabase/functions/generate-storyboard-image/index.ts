import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function generateImage(apiKey: string, prompt: string): Promise<string | null> {
  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-3.1-flash-image-preview',
      messages: [
        {
          role: 'user',
          content: `Generate an image: ${prompt}`
        }
      ],
      modalities: ['image', 'text']
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('API error:', response.status, errorText);
    if (response.status === 429 || response.status === 402) {
      throw { status: response.status, message: errorText };
    }
    return null;
  }

  const data = await response.json();
  console.log('Response keys:', JSON.stringify(Object.keys(data)));
  
  // Try multiple response formats
  const choice = data.choices?.[0]?.message;
  const imageUrl = choice?.images?.[0]?.image_url?.url
    || choice?.image?.url
    || (typeof choice?.content === 'string' && choice.content.startsWith('data:') ? choice.content : null);
  
  // Check for inline base64 in parts
  if (!imageUrl && Array.isArray(choice?.content)) {
    for (const part of choice.content) {
      if (part.type === 'image_url') return part.image_url?.url;
      if (part.inline_data?.data) return `data:${part.inline_data.mime_type || 'image/png'};base64,${part.inline_data.data}`;
    }
  }

  if (!imageUrl) {
    console.error('No image found in response structure:', JSON.stringify(data).substring(0, 500));
  }
  return imageUrl;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, sceneNumber } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
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
        const imageUrl = await generateImage(LOVABLE_API_KEY, prompts[attempt]);
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
        if (e.status === 402) {
          return new Response(
            JSON.stringify({ error: 'Credits required. Please add funds to continue.' }),
            { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
      // Small delay between retries
      if (attempt < prompts.length - 1) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    return new Response(
      JSON.stringify({ error: 'Image generation failed after 3 attempts. The AI model could not produce an image for this prompt. Try a simpler description.' }),
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
