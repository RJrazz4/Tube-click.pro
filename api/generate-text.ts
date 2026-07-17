/**
 * Vercel Edge Function — /api/generate-text
 * Secure Gemini integration — TubeBot AI Agent + SEO
 * Server keys only: GEMINI_API_KEY via process.env
 * Runtime: edge (fastest for US audience)
 */

export const config = {
  runtime: 'edge',
};

import { jsonResponse, requireEnv, GEMINI_MODEL, fetchGeminiWithRetry, extractGeminiText, cleanupJson, corsHeaders, safeJsonBody, classifyFetchError } from './_shared.js';

function normalize(arr: unknown, fallback: string[]) {
  if (!Array.isArray(arr)) return fallback;
  const n = arr.filter((v): v is string => typeof v === 'string').map(v => v.trim()).filter(Boolean);
  return n.length ? n : fallback;
}

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    // Parse request body with explicit error handling
    const body = await safeJsonBody(req);
    if (body.error) return jsonResponse({ error: body.error }, 400);
    const { topic, platform, style, language = 'hinglish' } = body.data;

    const key = requireEnv('GEMINI_API_KEY');

    if (!topic || topic.trim().length < 3) return jsonResponse({ error: 'Topic min 3 chars' }, 400);
    if (topic.length > 500) return jsonResponse({ error: 'Topic max 500 chars' }, 400);

    const sanitized = topic.trim().slice(0, 500);

    let langInstr = '';
    switch (language.toLowerCase()) {
      case 'hindi': langInstr = 'Write EVERYTHING in pure Hindi (Devanagari).'; break;
      case 'english': langInstr = 'Write everything in fluent English.'; break;
      default: langInstr = 'Write EVERYTHING in Cinematic Hinglish (Romanized Hindi + English blend).'; break;
    }

    const systemPrompt = `You are a viral YouTube content strategist.\n${langInstr}\nRespond in exact JSON: { "titles": [...5], "hooks": [...10], "script": "60s script narration only", "hashtags": [...10], "description": "SEO desc" }`;
    const userPrompt = `Topic: ${sanitized}\nPlatform: ${platform}\nStyle: ${style}\nLanguage: ${language}\nGenerate viral content as specified.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(key)}`;

    const res = await fetchGeminiWithRetry(url, {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.9 },
    });

    if (!res.ok) {
      const txt = await res.text();
      return jsonResponse({ error: txt || 'Gemini failed' }, res.status);
    }

    const data = await res.json();
    const content = extractGeminiText(data);
    if (!content) return jsonResponse({ error: 'Empty Gemini response' }, 502);

    let parsed: any;
    try { parsed = JSON.parse(cleanupJson(content)); } catch {
      parsed = { titles: [`🔥 ${sanitized}`], hooks: ['Start with truth'], script: content, hashtags: ['#viral'], description: sanitized };
    }

    return jsonResponse({
      titles: normalize(parsed.titles, [`🔥 ${sanitized}`]).slice(0,5),
      hooks: normalize(parsed.hooks, ['Hook']).slice(0,10),
      script: typeof parsed.script === 'string' ? parsed.script.trim() : content,
      hashtags: normalize(parsed.hashtags, ['#viral']).slice(0,10),
      description: typeof parsed.description === 'string' ? parsed.description.trim() : sanitized,
    });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[generate-text] error:', msg);
    return jsonResponse({ error: msg || 'Internal server error', service: 'generate-text' }, 500);
  }
}
