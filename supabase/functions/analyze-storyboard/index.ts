import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { script } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    if (!script || !script.trim()) {
      return new Response(
        JSON.stringify({ error: 'Script is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Analyzing script for story beats...');

    const systemPrompt = `You are an expert video storyboard analyst and cinematographer. Your job is to analyze scripts and identify the most visually powerful, story-critical moments for cinematic visualization.

STORY BEAT FRAMEWORK:
- Opening Hook: The attention-grabbing visual that pulls viewers in
- Problem: The struggle, pain point, or challenge being addressed
- Discovery: The "aha moment" or revelation
- Method: The process, tutorial, or solution in action
- Proof: Evidence, results, or testimonials
- Transformation: The before/after or success moment
- Call to Action: The inspiring final visual

RULES:
1. Identify 6-10 scenes maximum based on script length
2. Only pick the MOST visually powerful moments - scenes that would make stunning thumbnails
3. Skip generic or dialogue-heavy moments that don't translate well visually
4. Focus on action, emotion, and transformation
5. Each scene must be different and progress the story

For EACH scene, provide:
- beat_type: Which story beat this represents
- scene_number: Sequential number
- who: Character description (age, appearance, expression)
- what: The specific action happening
- emotion: The dominant feeling (e.g., "shock and disbelief", "triumphant joy")
- location: Detailed setting description
- camera_angle: Cinematographic direction (e.g., "close-up", "wide establishing shot", "dramatic low angle")
- visual_prompt: A ready-to-use image generation prompt

VISUAL PROMPT FORMAT (use exactly):
"Ultra realistic cinematic photography, 8K, professional DSLR, cinematic lighting, {location}, {character doing action}, {emotion on face}, {camera angle}, YouTube video quality, dramatic atmosphere, shallow depth of field, photorealistic, no blur, no text, no watermark"

Return ONLY valid JSON array with no markdown formatting.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { 
            role: 'user', 
            content: `Analyze this script and extract 6-10 story-critical scenes for cinematic visualization. Return as JSON array.

SCRIPT:
${script}

Return format:
[
  {
    "beat_type": "Opening Hook",
    "scene_number": 1,
    "who": "young professional woman in her 30s with determined expression",
    "what": "staring at laptop screen showing declining graphs",
    "emotion": "frustrated and overwhelmed",
    "location": "modern home office at night, blue light from screen illuminating face",
    "camera_angle": "close-up on face with screen reflection in eyes",
    "visual_prompt": "Ultra realistic cinematic photography, 8K, professional DSLR, cinematic lighting, modern home office at night, young professional woman staring at laptop with declining graphs, frustrated and overwhelmed expression, close-up with blue screen light reflecting in eyes, YouTube video quality, dramatic atmosphere, shallow depth of field, photorealistic, no blur, no text, no watermark"
  }
]`
          }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Credits required. Please add funds to continue.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || '';
    
    // Clean up the response
    content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    let scenes;
    try {
      scenes = JSON.parse(content);
    } catch (parseError) {
      console.error('Failed to parse scenes:', content);
      throw new Error('Failed to parse story analysis');
    }

    console.log(`Identified ${scenes.length} story-critical scenes`);

    return new Response(
      JSON.stringify({ scenes }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in analyze-storyboard:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
