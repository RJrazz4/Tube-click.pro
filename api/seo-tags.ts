/**
 * Vercel Edge — /api/seo-tags — Phase B1 LLM Routing (SEO)
 * Secure OpenRouter SEO bundle generation (key-rotated)
 * Server: OPENROUTER_API_KEYS
 */
export const config = { runtime: 'edge' };

import { jsonResponse, corsHeaders, safeJsonBody, providerErrorResponse, sanitizeThrownError, fetchOpenRouterWithRetry, extractOpenRouterText } from './_shared.js';

function cleanupJson(v: string) { return v.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim(); }

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const body = await safeJsonBody(req);
    if (body.error) return jsonResponse({ error: body.error }, 400);
    const { keyword, platform = 'YouTube', language = 'english' } = body.data;
    if (!keyword || keyword.trim().length < 2) return jsonResponse({ error: 'Keyword min 2 chars' }, 400);
    const sanitized = keyword.trim().slice(0,200);

    const systemPrompt = `You are YouTube SEO expert for US SaaS. Generate JSON: { "tags": [8-10 high-CTR tags], "seoScore": 0-100, "competition": "Medium (High Demand)", "searchVolume": "45K/mo", "optimizedTitle": "viral title 50-60 chars" }. Tags specific, long-tail, include year, tutorial, strategy. Use power words in title. Language: ${language}, Platform: ${platform}`;
    const userPrompt = `Keyword: ${sanitized} — generate SEO bundle.`;

    const outcome = await fetchOpenRouterWithRetry({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.8 },
    });
    const res = outcome.res;

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      return providerErrorResponse(txt, res.status, 'seo-tags');
    }

    const data = await res.json();
    const content = extractOpenRouterText(data);
    if (!content) return jsonResponse({ error: 'Empty response' }, 502);

    let parsed: any;
    try { parsed = JSON.parse(cleanupJson(content)); } catch {
      parsed = {
        tags: [sanitized, `${sanitized} 2026`, `how to ${sanitized}`, `${sanitized} tutorial`],
        seoScore: 85,
        competition: 'Medium (High Demand)',
        searchVolume: '20K/mo',
        optimizedTitle: `The Ultimate Truth About ${sanitized} (Nobody Tells You)`,
      };
    }

    const tags = Array.isArray(parsed.tags) ? parsed.tags.filter((t: unknown) => typeof t === 'string').map((t: string) => t.trim()).filter(Boolean).slice(0,12) : [];
    const seoScore = typeof parsed.seoScore === 'number' ? Math.round(parsed.seoScore) : 85;

    return jsonResponse({
      model: outcome.model,
      ...(outcome.failedOver ? { modelFailover: outcome.attempted } : {}),
      tags,
      seoScore,
      competition: parsed.competition || 'Medium (High Demand)',
      searchVolume: parsed.searchVolume || '20K/mo',
      optimizedTitle: parsed.optimizedTitle || `Ultimate Guide to ${sanitized}`,
    });

  } catch (e: unknown) {
    console.error('[seo-tags] error:', e);
    return jsonResponse({ error: sanitizeThrownError(e, 'seo-tags'), code: 'INTERNAL', service: 'seo-tags' }, 500);
  }
}
