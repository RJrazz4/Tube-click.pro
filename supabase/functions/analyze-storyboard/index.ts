import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GEMINI_MODEL = "gemini-2.0-flash";
const RETRY_DELAYS = [2000, 5000, 10000];

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
    const { script } = await req.json();

    // SECURE: Server env only
    const geminiApiKey =
      Deno.env.get('GEMINI_API_KEY') ||
      Deno.env.get('GOOGLE_AI_API_KEY') ||
      '';

    if (!geminiApiKey) {
      return jsonResponse({ success: false, error: 'GEMINI_API_KEY not configured on server.', action: 'Contact admin.' }, 500);
    }

    if (!script || !script.trim()) {
      return jsonResponse({ success: false, error: 'Script is required.', action: 'Paste your video script.' }, 400);
    }

    if (script.trim().length < 100) {
      return jsonResponse({ success: false, error: 'Script too short. Minimum 100 characters.', action: 'Add more content.' }, 400);
    }

    const trimmedScript = script.slice(0, 10000);

    const systemPrompt = `You are an expert video storyboard analyst and cinematographer. Analyze scripts and identify visually powerful, story-critical moments.

STORY BEAT FRAMEWORK (Pick 4-10 based on script complexity):
- Opening Hook, Problem, Discovery, Method, Proof, Transformation, Call to Action

For EACH scene provide: beat_type, scene_number, who, what, emotion, location, camera_angle, visual_prompt, motion_prompt.

Return ONLY valid JSON array.`;

    const userPrompt = `Analyze this script and extract 4-10 story-critical scenes. Return as JSON array.

SCRIPT:
${trimmedScript}

Return format: [{ "beat_type": "...", "scene_number": 1, "who": "...", "what": "...", "emotion": "...", "location": "...", "camera_angle": "...", "visual_prompt": "Ultra realistic cinematic photography, 8K, ...", "motion_prompt": "..." }]`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(geminiApiKey)}`;

    const response = await fetchGeminiWithRetry(geminiUrl, {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.7 },
    });

    if (!response.ok) {
      const errorMessage = await readGeminiError(response);
      if (response.status === 401 || response.status === 403) {
        return jsonResponse({ success: false, error: 'Server Gemini key invalid.', action: 'Admin: check env.' }, 500);
      }
      if (response.status === 429) {
        return jsonResponse({ success: false, error: 'Gemini rate limit exceeded.', action: 'Wait 30s.' }, 429);
      }
      return jsonResponse({ success: false, error: errorMessage, action: 'Try again.' }, 500);
    }

    const data = await response.json();
    let content = extractGeminiText(data) || '';
    
    if (!content) {
      return jsonResponse({ success: false, error: 'Empty response from Gemini.', action: 'Try again.' }, 502);
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
      if (scenes.length < 4) throw new Error('Too few scenes');
      
      scenes = scenes.map((scene: any, idx: number) => ({
        beat_type: scene.beat_type || `Scene ${idx + 1}`,
        scene_number: idx + 1,
        who: scene.who || 'Person',
        what: scene.what || 'Action',
        emotion: scene.emotion || 'Neutral',
        location: scene.location || 'Indoor setting',
        camera_angle: scene.camera_angle || 'Medium shot',
        visual_prompt: scene.visual_prompt || `Cinematic photo, ${scene.who || 'person'}, ${scene.emotion || 'neutral'}`,
        motion_prompt: scene.motion_prompt || 'Slow cinematic movement'
      }));
      
    } catch {
      return jsonResponse({ success: false, error: 'Failed to analyze script.', action: 'Try again with clearer script.' }, 502);
    }

    return jsonResponse({ scenes });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return jsonResponse({ success: false, error: errorMessage, action: 'Try again.' }, 500);
  }
});
