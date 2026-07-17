/**
 * Vercel Edge — /api/vision-guide
 * OpenRouter Gemini Vision (key-rotated): screenshots -> tutorial guide
 * Server: OPENROUTER_API_KEYS
 */
export const config = { runtime: 'edge' };
import { jsonResponse, corsHeaders, safeJsonBody, providerErrorResponse, sanitizeThrownError, fetchOpenRouterWithRetry, extractOpenRouterText } from './_shared.js';

function toInlineData(imgData: string) {
  const m = imgData.match(/^data:(.*?);base64,(.*)$/);
  if (!m) throw new Error('Invalid image format');
  return { inlineData: { mimeType: m[1], data: m[2] } };
}

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
  try {
    const body = await safeJsonBody(req);
    if (body.error) return jsonResponse({ error: body.error }, 400);
    const { images } = body.data;
    if (!images || !Array.isArray(images) || images.length === 0) return jsonResponse({ error: 'No images' }, 400);
    if (images.length > 10) return jsonResponse({ error: 'Max 10 images' }, 400);
    const content = [
      { type: 'text', text: 'You are an expert technical writer. Analyze screenshots and create comprehensive step-by-step tutorial guide in clean Markdown.' },
      ...images.map((d: string) => toInlineData(d))
    ];
    const outcome = await fetchOpenRouterWithRetry({ contents: [{ role: 'user', parts: content }], generationConfig: { temperature: 0.4 } });
    const res = outcome.res;
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      return providerErrorResponse(txt, res.status, 'vision-guide');
    }
    const data = await res.json();
    const guide = extractOpenRouterText(data) || '';
    if (!guide.trim()) return jsonResponse({ error: 'Empty guide' }, 502);
    return jsonResponse({ model: outcome.model, ...(outcome.failedOver ? { modelFailover: outcome.attempted } : {}), guide });
  } catch (e: unknown) {
    console.error('[vision-guide] error:', e);
    return jsonResponse({ error: sanitizeThrownError(e, 'vision-guide'), code: 'INTERNAL', service: 'vision-guide' }, 500);
  }
}
