/**
 * Vercel Edge — POST /api/repurpose
 *
 * Rewrites a source script/transcript into platform-native assets
 * (YouTube description, X thread, Instagram caption, LinkedIn post) via
 * OpenRouter with key rotation (shared helper in _shared.ts).
 *
 * Honesty rule: the model may use ONLY ideas/facts present in the source
 * text — no invented facts, numbers, quotes or timestamp chapters. On any
 * provider/parse failure this endpoint returns an error; the client then
 * falls back to a local template that it LABELS as a basic template —
 * template output is never presented as AI output.
 *
 * Runtime: Edge.
 */
export const config = { runtime: 'edge', maxDuration: 60 };

import { jsonResponse, corsHeaders, safeJsonBody, providerErrorResponse, sanitizeThrownError, fetchOpenRouterWithRetry, extractOpenRouterText } from './_shared.js';

function cleanupJson(v: string) { return v.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim(); }

function nonEmptyString(v: unknown): string {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : '';
}

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const body = await safeJsonBody(req);
    if (body.error) return jsonResponse({ error: body.error }, 400);
    const { script, source } = body.data ?? {};
    if (!script || typeof script !== 'string' || script.trim().length < 10) {
      return jsonResponse({ error: 'Script min 10 chars' }, 400);
    }
    const sanitized = script.trim().slice(0, 8000);
    const wordCount = sanitized.split(/\s+/).filter(Boolean).length;
    const sourceNote = source && typeof source === 'object' && typeof source.videoId === 'string'
      ? ` The source is a transcript of YouTube video ${source.videoId}.`
      : '';

    const systemPrompt = `You are a content repurposing expert for TubeClick Pro. You receive a source script or transcript and rewrite it into platform-native assets.

STRICT RULES:
- Use ONLY ideas, facts and claims present in the source. Never invent facts, numbers, statistics, quotes, or timestamp chapters.
- Keep the source's language (English, Hindi or Hinglish) — do not translate.
- Every asset must be built from the source's actual content, not generic creator advice.

Return strict JSON only, no markdown, no commentary:
{
  "youtubeDesc": "First line = a hook drawn from the source's strongest point. Then a short summary of what the source actually covers, a subscribe CTA, and 5-8 relevant hashtags on the last line.",
  "twitterThread": ["1/ ...", "2/ ...", "3/ ...", "4/ ..."],
  "instagramCaption": "Hook line from the source's strongest idea, 2-4 lines expanding the source's real points, a save/share CTA, then 8-10 relevant hashtags.",
  "linkedinPost": "A professional post built from the source's actual lesson or argument, ending with one discussion question."
}

twitterThread: 4-6 posts, each under 280 characters, numbered "1/", "2/", ..., each carrying one real point from the source, last post carries a follow/CTA line.`;

    const userPrompt = `Source script (${wordCount} words):${sourceNote}\n\n${sanitized}\n\nRewrite this into the 4 platform assets as JSON.`;

    const outcome = await fetchOpenRouterWithRetry({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.7 },
    });
    const res = outcome.res;

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      return providerErrorResponse(txt, res.status, 'repurpose');
    }

    const data = await res.json();
    const content = extractOpenRouterText(data);
    if (!content) return jsonResponse({ error: 'Empty response' }, 502);

    let parsed: any;
    try { parsed = JSON.parse(cleanupJson(content)); } catch {
      return jsonResponse({ error: 'Model returned unparseable output', code: 'BAD_MODEL_OUTPUT', service: 'repurpose' }, 502);
    }

    const youtubeDesc = nonEmptyString(parsed?.youtubeDesc);
    const instagramCaption = nonEmptyString(parsed?.instagramCaption);
    const linkedinPost = nonEmptyString(parsed?.linkedinPost);
    const twitterThread = Array.isArray(parsed?.twitterThread)
      ? parsed.twitterThread.filter((t: unknown) => typeof t === 'string' && t.trim().length > 0).map((t: string) => t.trim()).slice(0, 6)
      : [];

    if (!youtubeDesc || !instagramCaption || !linkedinPost || twitterThread.length < 3) {
      return jsonResponse({ error: 'Model output incomplete', code: 'BAD_MODEL_OUTPUT', service: 'repurpose' }, 502);
    }

    return jsonResponse({
      model: outcome.model,
      ...(outcome.failedOver ? { modelFailover: outcome.attempted } : {}),
      youtubeDesc,
      twitterThread,
      instagramCaption,
      linkedinPost,
    });

  } catch (e: unknown) {
    console.error('[repurpose] error:', e);
    return jsonResponse({ error: sanitizeThrownError(e, 'repurpose'), code: 'INTERNAL', service: 'repurpose' }, 500);
  }
}
