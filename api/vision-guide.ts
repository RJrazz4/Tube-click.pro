/**
 * Vercel Edge — /api/vision-guide
 * Gemini Vision: screenshots -> tutorial guide
 * Server: GEMINI_API_KEY
 */
export const config = { runtime: 'edge' };
import { jsonResponse, requireEnv, GEMINI_MODEL, fetchGeminiWithRetry, corsHeaders, safeJsonBody } from './_shared.js';

function extractText(d: any) {
  return d?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('\n').trim();
}
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
    const key = requireEnv('GEMINI_API_KEY');
    const content = [
      { type: 'text', text: 'You are an expert technical writer. Analyze screenshots and create comprehensive step-by-step tutorial guide in clean Markdown.' },
      ...images.map((d: string) => toInlineData(d))
    ];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(key)}`;
    const res = await fetchGeminiWithRetry(url, { contents: [{ role: 'user', parts: content }], generationConfig: { temperature: 0.4 } });
    if (!res.ok) return jsonResponse({ error: `Gemini ${res.status}` }, res.status);
    const data = await res.json();
    const guide = extractText(data) || '';
    if (!guide.trim()) return jsonResponse({ error: 'Empty guide' }, 502);
    return jsonResponse({ guide });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[vision-guide] error:', msg);
    return jsonResponse({ error: msg || 'Internal server error', service: 'vision-guide' }, 500);
  }
}
