import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GEMINI_MODEL = "gemini-2.0-flash";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function extractGeminiText(data: any) {
  return data?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text || '')
    .join('\n')
    .trim();
}

function cleanupJson(value: string) {
  return value.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
}

async function readGeminiError(response: Response) {
  try {
    const data = await response.json();
    return data?.error?.message || 'Gemini request failed.';
  } catch {
    return await response.text() || 'Gemini request failed.';
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { script, customApiKey } = await req.json();

    const geminiApiKey =
      (typeof customApiKey === 'string' ? customApiKey.trim() : '') ||
      Deno.env.get('GEMINI_API_KEY') ||
      Deno.env.get('GOOGLE_AI_API_KEY') ||
      '';

    if (!geminiApiKey) {
      return jsonResponse({ error: 'Gemini API key not configured. Add your key in Settings to analyze storyboards.' }, 400);
    }

    if (!script || !script.trim()) {
      return jsonResponse({ error: 'Script is required. Please paste your video script.' }, 400);
    }

    if (script.trim().length < 100) {
      return jsonResponse({ error: 'Script too short. Please provide at least 100 characters for meaningful analysis.' }, 400);
    }

    const trimmedScript = script.slice(0, 10000);

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

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(geminiApiKey)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: `Analyze this script and extract 4 to 10 story-critical scenes for cinematic visualization (choose count based on script length/complexity). Return as JSON array.

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
            }],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.7,
        },
      }),
    });

    if (!response.ok) {
      const errorMessage = await readGeminiError(response);

      if (response.status === 400 || response.status === 401 || response.status === 403) {
        return jsonResponse({ error: 'Invalid Gemini API key or access denied. Update your key in Settings.' }, 401);
      }
      if (response.status === 429) {
        return jsonResponse({ error: 'Gemini rate limit exceeded. Please wait and try again.' }, 429);
      }

      return jsonResponse({ error: errorMessage || 'Storyboard analysis failed.' }, 500);
    }

    const data = await response.json();
    let content = extractGeminiText(data) || '';
    
    if (!content) {
      return jsonResponse({ error: 'Empty response from Gemini. Please try again.' }, 502);
    }
    
    content = cleanupJson(content);
    
    let scenes;
    try {
      scenes = JSON.parse(content);
      scenes = Array.isArray(scenes) ? scenes : scenes?.scenes;
      
      if (!Array.isArray(scenes) || scenes.length === 0) {
        throw new Error('Invalid scenes format');
      }
      
      scenes = scenes.slice(0, 10);
      if (scenes.length < 4) {
        throw new Error('Too few scenes generated');
      }
      
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
      
    } catch {
      return jsonResponse({ error: 'Failed to analyze script. Please try again with a clearer script.' }, 502);
    }

    return jsonResponse({ scenes });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return jsonResponse({ error: errorMessage }, 500);
  }
});
