/**
 * Vercel Edge — /api/generate-storyboard-image — Phase C1 FINAL
 * White-Label: Tube.Flash (Pollinations free) / Tube.Pro (SnapGen free) / Tube.Cinematic (Fal.ai premium)
 * Server: FAL_API_KEY optional, SNAPGEN_API_KEY optional
 */
export const config = { runtime: 'edge' };
import { jsonResponse, corsHeaders, safeJsonBody } from './_shared.js';

async function genFal(prompt: string): Promise<string | null> {
  const falKey = process.env.FAL_API_KEY;
  if (!falKey) return null;
  try {
    const submit = await fetch('https://queue.fal.run/fal-ai/fast-lightning-sdxl', {
      method: 'POST',
      headers: { Authorization: `Key ${falKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, image_size: 'landscape_16_9', num_inference_steps: 4, num_images: 1, enable_safety_checker: false }),
    });
    if (!submit.ok) return null;
    const { request_id } = await submit.json();
    if (!request_id) return null;
    const start = Date.now();
    while (Date.now() - start < 28000) {
      await new Promise(r => setTimeout(r, 1000));
      const st = await fetch(`https://queue.fal.run/fal-ai/fast-lightning-sdxl/requests/${request_id}/status`, { headers: { Authorization: `Key ${falKey}` } });
      if (!st.ok) continue;
      const j = await st.json();
      if (j.status === 'COMPLETED') {
        const res = await fetch(`https://queue.fal.run/fal-ai/fast-lightning-sdxl/requests/${request_id}`, { headers: { Authorization: `Key ${falKey}` } });
        if (!res.ok) return null;
        const data = await res.json();
        return data.images?.[0]?.url || null;
      }
      if (j.status === 'FAILED') return null;
    }
    return null;
  } catch { return null; }
}

function pollinationsUrl(prompt: string, seed: number): string {
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1280&height=720&nologo=true&seed=${seed}&model=flux`;
}
function snapgenUrl(prompt: string, seed: number): string {
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1280&height=720&nologo=true&seed=${seed + 1000}&model=turbo&enhance=true`;
}

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
  try {
    const body = await safeJsonBody(req);
    if (body.error) return jsonResponse({ error: body.error }, 400);
    const { prompt, sceneNumber, brand = 'Tube.Cinematic' } = body.data;
    if (!prompt) return jsonResponse({ error: 'Prompt required' }, 400);

    const selectedBrand = brand as string;

    // Try Fal if cinematic or pro
    if (selectedBrand === 'Tube.Cinematic' || selectedBrand === 'Tube.Pro') {
      const falUrl = await genFal(prompt);
      if (falUrl) return jsonResponse({ imageUrl: falUrl, sceneNumber, brand: selectedBrand, provider: 'fal' });
      // Fallback to SnapGen white-label
      return jsonResponse({ imageUrl: snapgenUrl(prompt, Date.now() + sceneNumber * 123), sceneNumber, brand: selectedBrand, provider: 'snapgen-fallback' });
    }

    // Flash — Pollinations free
    return jsonResponse({ imageUrl: pollinationsUrl(prompt, Date.now() + sceneNumber * 456), sceneNumber, brand: selectedBrand, provider: 'pollinations' });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[generate-storyboard-image] error:', msg);
    return jsonResponse({ error: msg || 'Internal server error', service: 'generate-storyboard-image' }, 500);
  }
}
