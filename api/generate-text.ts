/**
 * Vercel Edge Function — /api/generate-text
 * Secure OpenRouter integration — TubeBot AI Agent + SEO (key-rotated)
 * Server keys only: OPENROUTER_API_KEYS via process.env
 * Runtime: edge (fastest for US audience)
 */

export const config = {
  runtime: 'edge',
};

import { jsonResponse, cleanupJson, corsHeaders, safeJsonBody, providerErrorResponse, sanitizeThrownError, fetchOpenRouterWithRetry, extractOpenRouterText } from './_shared.js';

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

    const outcome = await fetchOpenRouterWithRetry({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.9 },
    });
    const res = outcome.res;

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      return providerErrorResponse(txt, res.status, 'generate-text');
    }

    const data = await res.json();
    const content = extractOpenRouterText(data);
    if (!content) return jsonResponse({ error: 'Empty Gemini response' }, 502);

    let parsed: any;
    try { parsed = JSON.parse(cleanupJson(content)); } catch {
      parsed = { titles: [`🔥 ${sanitized}`], hooks: ['Start with truth'], script: content, hashtags: ['#viral'], description: sanitized };
    }

    return jsonResponse({
      model: outcome.model,
      ...(outcome.failedOver ? { modelFailover: outcome.attempted } : {}),
      titles: normalize(parsed.titles, [`🔥 ${sanitized}`]).slice(0,5),
      hooks: normalize(parsed.hooks, ['Hook']).slice(0,10),
      script: typeof parsed.script === 'string' ? parsed.script.trim() : content,
      hashtags: normalize(parsed.hashtags, ['#viral']).slice(0,10),
      description: typeof parsed.description === 'string' ? parsed.description.trim() : sanitized,
    });

  } catch (e: unknown) {
    console.error('[generate-text] error:', e);
    return jsonResponse({ error: sanitizeThrownError(e, 'generate-text'), code: 'INTERNAL', service: 'generate-text' }, 500);
  }
}
