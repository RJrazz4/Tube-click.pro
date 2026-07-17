/**
 * Vercel Edge — /api/analyze-storyboard
 * Gemini: GEMINI_API_KEY — fast edge for US storyboard analysis
 */
export const config = { runtime: 'edge' };
import { jsonResponse, requireEnv, GEMINI_MODEL, fetchGeminiWithRetry, corsHeaders } from './_shared.js';

function extractGeminiText(data: any) {
  return data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('\n').trim();
}
function cleanupJson(v: string) { return v.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim(); }

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
  try {
    const { script } = await req.json();
    if (!script || script.trim().length < 100) return jsonResponse({ error: 'Script min 100 chars' }, 400);
    const key = requireEnv('GEMINI_API_KEY');
    const trimmed = script.slice(0, 10000);
    const systemPrompt = `You are an expert storyboard analyst. Extract 4-10 story-critical scenes as JSON array. Each: beat_type, scene_number, who, what, emotion, location, camera_angle, visual_prompt, motion_prompt. Return only JSON array.`;
    const userPrompt = `Script: ${trimmed}`;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(key)}`;
    const res = await fetchGeminiWithRetry(url, {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.7 },
    });
    if (!res.ok) return jsonResponse({ error: `Gemini ${res.status}` }, res.status);
    const data = await res.json();
    let content = extractGeminiText(data) || '';
    content = cleanupJson(content);
    let scenes;
    try {
      scenes = JSON.parse(content);
      scenes = Array.isArray(scenes) ? scenes : scenes?.scenes;
      if (!Array.isArray(scenes)) throw new Error('Invalid');
      scenes = scenes.slice(0,10).map((s: any, i: number) => ({
        beat_type: s.beat_type || `Scene ${i+1}`,
        scene_number: i+1,
        who: s.who || 'Person',
        what: s.what || 'Action',
        emotion: s.emotion || 'Neutral',
        location: s.location || 'Indoor',
        camera_angle: s.camera_angle || 'Medium shot',
        visual_prompt: s.visual_prompt || `Cinematic photo, ${s.who || 'person'}`,
        motion_prompt: s.motion_prompt || 'Slow cinematic movement'
      }));
    } catch {
      return jsonResponse({ error: 'Failed to parse storyboard' }, 502);
    }
    return jsonResponse({ scenes });
  } catch (e: any) {
    return jsonResponse({ error: e.message }, 500);
  }
}
