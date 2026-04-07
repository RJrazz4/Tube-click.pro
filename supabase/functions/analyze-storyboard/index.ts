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
        JSON.stringify({ error: 'Script is required. Please paste your video script.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate script length (minimum 100 characters for meaningful analysis)
    if (script.trim().length < 100) {
      return new Response(
        JSON.stringify({ error: 'Script too short. Please provide at least 100 characters for meaningful analysis.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Limit script length to prevent API overuse (max ~10,000 characters)
    const trimmedScript = script.slice(0, 10000);

    console.log('Analyzing script for story beats...');

    const systemPrompt = `You are an expert video storyboard analyst and cinematographer. Your job is to analyze scripts and identify the most visually powerful, story-critical moments for cinematic visualization.

STORY BEAT FRAMEWORK (Pick 6 from these):
- Opening Hook: The attention-grabbing visual that pulls viewers in
- Problem: The struggle, pain point, or challenge being addressed
- Discovery: The "aha moment" or revelation
- Method: The process, tutorial, or solution in action
- Proof: Evidence, results, or testimonials
- Transformation: The before/after or success moment
- Call to Action: The inspiring final visual

CRITICAL RULES:
1. Identify between 4 and 10 scenes depending on script length and complexity. Short scripts (under 500 chars) should get 4-5 scenes. Medium scripts get 6-7. Long scripts (2000+ chars) can get up to 10.
2. Each scene MUST directly relate to a specific part of the script
3. Pick only the MOST visually powerful moments
4. Skip generic or dialogue-heavy moments that don't translate well visually
5. Focus on action, emotion, and transformation
6. Each scene must progress the story logically

For EACH scene, provide:
- beat_type: Which story beat this represents
- scene_number: Sequential number (1-6)
- who: Detailed character description (age, appearance, clothing, expression)
- what: The specific action happening (based on script content)
- emotion: The dominant feeling (e.g., "shock and disbelief", "triumphant joy")
- location: Detailed setting description with lighting
- camera_angle: Cinematographic direction (e.g., "close-up", "wide establishing shot")
- visual_prompt: Ready-to-use image generation prompt
- motion_prompt: Camera/subject motion for video (e.g., "slow zoom in on face", "camera pans left revealing the scene")

VISUAL PROMPT FORMAT (use exactly):
"Ultra realistic cinematic photography, 8K, professional DSLR, cinematic lighting, {location}, {character doing action}, {emotion on face}, {camera angle}, YouTube video quality, dramatic atmosphere, shallow depth of field, photorealistic, no blur, no text, no watermark"

MOTION PROMPT FORMAT:
"[Camera motion] while [subject action], [mood/atmosphere]"
Examples:
- "Slow push in on subject's face while they realize the truth, tension building"
- "Wide crane shot descending as crowd gathers, anticipation rising"
- "Handheld follow shot tracking subject walking, documentary feel"

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
            content: `Analyze this script and extract 4 to 10 story-critical scenes for cinematic visualization (choose count based on script length/complexity). Return as JSON array.

SCRIPT:
${trimmedScript}

Return format:
[
  {
    "beat_type": "Opening Hook",
    "scene_number": 1,
    "who": "young Indian man in his 20s with determined expression, wearing casual clothes",
    "what": "staring at laptop screen showing declining graphs",
    "emotion": "frustrated and overwhelmed",
    "location": "modern home office at night, blue light from screen illuminating face",
    "camera_angle": "close-up on face with screen reflection in eyes",
    "visual_prompt": "Ultra realistic cinematic photography, 8K, professional DSLR, cinematic lighting, modern home office at night, young Indian man staring at laptop with declining graphs, frustrated and overwhelmed expression, close-up with blue screen light reflecting in eyes, YouTube video quality, dramatic atmosphere, shallow depth of field, photorealistic, no blur, no text, no watermark",
    "motion_prompt": "Slow push in on subject's face while screen flickers, tension building"
  }
]

CRITICAL: Return 4-10 scenes based on script complexity. Each scene MUST be visually powerful and story-critical.`
          }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please wait 30 seconds and try again.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Credits exhausted. Please add funds to continue.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`AI service temporarily unavailable. Please try again.`);
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || '';
    
    if (!content) {
      throw new Error('Empty response from AI. Please try again.');
    }
    
    // Clean up the response
    content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    let scenes;
    try {
      scenes = JSON.parse(content);
      
      // Validate scenes array
      if (!Array.isArray(scenes) || scenes.length === 0) {
        throw new Error('Invalid scenes format');
      }
      
      // Ensure exactly 6 scenes
      scenes = scenes.slice(0, 6);
      
      // Validate each scene has required fields
      scenes = scenes.map((scene, idx) => ({
        beat_type: scene.beat_type || `Scene ${idx + 1}`,
        scene_number: idx + 1,
        who: scene.who || 'Person',
        what: scene.what || 'Action',
        emotion: scene.emotion || 'Neutral',
        location: scene.location || 'Indoor setting',
        camera_angle: scene.camera_angle || 'Medium shot',
        visual_prompt: scene.visual_prompt || `Cinematic photo, ${scene.who || 'person'}, ${scene.emotion || 'neutral'} expression`,
        motion_prompt: scene.motion_prompt || 'Slow cinematic movement, atmospheric'
      }));
      
    } catch (parseError) {
      console.error('Failed to parse scenes:', content);
      throw new Error('Failed to analyze script. Please try again with a clearer script.');
    }

    console.log(`Successfully identified ${scenes.length} story-critical scenes`);

    return new Response(
      JSON.stringify({ scenes }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in analyze-storyboard:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
