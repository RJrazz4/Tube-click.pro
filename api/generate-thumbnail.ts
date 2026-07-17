/**
 * Vercel Edge — /api/generate-thumbnail
 * Maps to brand names: Tube.Flash (Pollinations free) vs Tube.Pro (Fal.ai pro)
 * Server keys only: FAL_API_KEY
 */
export const config = { runtime: 'edge' };

import { jsonResponse, requireEnv, corsHeaders } from './_shared';

function dims(ratio: string) {
  return ratio === '9:16' ? { w: 1080, h: 1920, fal: 'portrait_16_9' } : { w: 1280, h: 720, fal: 'landscape_16_9' };
}

function buildPrompt(title: string, emotion: string, style: string, ratio: string, variation: string) {
  return `${title}, ${emotion} emotion, ${style} style, ${ratio}, ${variation}, bold composition, high contrast cinematic lighting, professional YouTube thumbnail, no text, ultra detailed`;
}

async function genFal(prompt: string, key: string, size: string): Promise<string> {
  const submit = await fetch('https://queue.fal.run/fal-ai/fast-lightning-sdxl', {
    method: 'POST',
    headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, image_size: size, num_inference_steps: 4, num_images: 1, enable_safety_checker: false }),
  });
  if (!submit.ok) throw new Error(`Fal submit ${submit.status}`);
  const { request_id } = await submit.json();
  if (!request_id) throw new Error('No request_id');
  const start = Date.now();
  while (Date.now() - start < 30000) {
    await new Promise(r => setTimeout(r, 1000));
    const st = await fetch(`https://queue.fal.run/fal-ai/fast-lightning-sdxl/requests/${request_id}/status`, { headers: { Authorization: `Key ${key}` } });
    if (!st.ok) continue;
    const jd = await st.json();
    if (jd.status === 'COMPLETED') {
      const res = await fetch(`https://queue.fal.run/fal-ai/fast-lightning-sdxl/requests/${request_id}`, { headers: { Authorization: `Key ${key}` } });
      const j = await res.json();
      if (j.images?.[0]?.url) return j.images[0].url;
      throw new Error('No image url');
    }
    if (jd.status === 'FAILED') throw new Error('Fal failed');
  }
  throw new Error('Timeout');
}

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const { title, emotion = 'Exciting', style = 'Modern', aspectRatio = '16:9', count = 4, brand = 'Tube.Pro' } = await req.json();
    if (!title || title.trim().length < 3) return jsonResponse({ error: 'Title min 3 chars' }, 400);

    const { w, h, fal } = dims(aspectRatio) as any;
    const variations = [
      'dramatic lighting, bold colors, cinematic',
      'minimalist, clean, modern aesthetic',
      'energetic, dynamic, action-packed',
      'mysterious, intriguing, dark tones',
    ];

    let thumbnails: (string | null)[] = [];

    if (brand === 'Tube.Flash') {
      // Free Pollinations — no key, but routed through server to hide mapping logic + enable caching
      thumbnails = variations.slice(0, Math.min(count, 4)).map((v, i) => {
        const prompt = encodeURIComponent(buildPrompt(title, emotion, style, aspectRatio, v));
        return `https://image.pollinations.ai/prompt/${prompt}?width=${w}&height=${h}&nologo=true&seed=${Date.now() + i}`;
      });
    } else {
      // Pro: Fal.ai
      const falKey = requireEnv('FAL_API_KEY');
      const results = await Promise.all(variations.slice(0, Math.min(count, 4)).map(async (v) => {
        try {
          const url = await genFal(buildPrompt(title, emotion, style, aspectRatio, v), falKey, fal);
          return url;
        } catch { return null; }
      }));
      thumbnails = results;
    }

    const success = thumbnails.filter(Boolean).length;
    if (success === 0) return jsonResponse({ error: 'All thumbnails failed' }, 502);

    return jsonResponse({ thumbnails, dimensions: { width: w, height: h, ratio: aspectRatio }, brand });

  } catch (e: any) {
    return jsonResponse({ error: e.message || 'Unknown' }, 500);
  }
}
