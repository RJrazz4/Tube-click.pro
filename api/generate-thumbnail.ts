/**
 * Vercel Edge — /api/generate-thumbnail — Phase C1 FINAL
 * White-Label Image API: Tube.Flash (Pollinations free) vs Tube.Pro (SnapGen free) vs Tube.Cinematic (Fal.ai pro)
 * Server keys only: FAL_API_KEY optional, SNAPGEN_API_KEY optional — both server env
 * Client only sends brand string, never knows provider
 * Runtime: edge (fast US)
 */
export const config = { runtime: 'edge' };

import { jsonResponse, corsHeaders } from './_shared.js';

function dims(ratio: string) {
  return ratio === '9:16' ? { w: 1080, h: 1920, fal: 'portrait_16_9' } : { w: 1280, h: 720, fal: 'landscape_16_9' };
}

function buildPrompt(title: string, emotion: string, style: string, ratio: string, variation: string) {
  return `${title}, ${emotion} emotion, ${style} style, ${ratio} aspect ratio, ${variation}, single dominant subject, bold composition, high contrast cinematic lighting, vibrant color separation, professional YouTube thumbnail aesthetic, no text, no watermark, ultra detailed, 8K`;
}

async function genFal(prompt: string, falSize: string): Promise<string | null> {
  const falKey = process.env.FAL_API_KEY;
  if (!falKey) return null;
  try {
    const submit = await fetch('https://queue.fal.run/fal-ai/fast-lightning-sdxl', {
      method: 'POST',
      headers: { Authorization: `Key ${falKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, image_size: falSize, num_inference_steps: 4, num_images: 1, enable_safety_checker: false }),
    });
    if (!submit.ok) return null;
    const { request_id } = await submit.json();
    if (!request_id) return null;
    const start = Date.now();
    while (Date.now() - start < 28000) {
      await new Promise(r => setTimeout(r, 1000));
      const st = await fetch(`https://queue.fal.run/fal-ai/fast-lightning-sdxl/requests/${request_id}/status`, { headers: { Authorization: `Key ${falKey}` } });
      if (!st.ok) continue;
      const jd = await st.json();
      if (jd.status === 'COMPLETED') {
        const res = await fetch(`https://queue.fal.run/fal-ai/fast-lightning-sdxl/requests/${request_id}`, { headers: { Authorization: `Key ${falKey}` } });
        if (!res.ok) return null;
        const j = await res.json();
        return j.images?.[0]?.url || null;
      }
      if (jd.status === 'FAILED') return null;
    }
    return null;
  } catch {
    return null;
  }
}

// SnapGen free — no official API docs, white-labeled as Tube.Pro
// For MVP, SnapGen uses Pollinations turbo enhanced endpoint (free unlimited, no login)
// In future, if SNAPGEN_API_KEY provided, would call https://api.snapgen.io/v1/images/generations
async function genSnapGen(prompt: string, width: number, height: number, seed: number): Promise<string> {
  // White-label SnapGen as enhanced Pollinations turbo — free, no key, higher quality than base flux
  const snapgenKey = process.env.SNAPGEN_API_KEY;
  const encoded = encodeURIComponent(prompt);

  // If SnapGen API key exists, try real API (future)
  if (snapgenKey) {
    try {
      // Hypothetical SnapGen API — based on similar free services pattern
      const res = await fetch('https://api.snapgen.io/v1/images/generations', {
        method: 'POST',
        headers: { Authorization: `Bearer ${snapgenKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, width, height, n: 1, model: 'snapgen-v1' }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.data?.[0]?.url) return data.data[0].url;
        if (data.url) return data.url;
      }
    } catch {}
  }

  // Fallback/free tier: Pollinations turbo enhanced — white-labeled as SnapGen (Tube.Pro)
  // Using turbo + enhance=true for better quality than Tube.Flash (flux)
  return `https://image.pollinations.ai/prompt/${encoded}?width=${width}&height=${height}&nologo=true&seed=${seed + 1000}&model=turbo&enhance=true`;
}

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const { title, emotion = 'Exciting', style = 'Modern', aspectRatio = '16:9', count = 4, brand = 'Tube.Pro' } = await req.json();
    if (!title || title.trim().length < 3) return jsonResponse({ error: 'Title min 3 chars' }, 400);

    const { w, h, fal } = dims(aspectRatio) as any;
    const variations = [
      'dramatic lighting, bold colors, cinematic, high contrast',
      'minimalist, clean, modern aesthetic, vibrant',
      'energetic, dynamic, action-packed, eye-catching',
      'mysterious, intriguing, dark tones, cinematic glow',
    ];

    const selectedBrand = (brand as string) || 'Tube.Pro';
    const thumbnails: (string | null)[] = [];

    // Generate sequentially with brand mapping
    for (let i = 0; i < Math.min(count, 4); i++) {
      const variation = variations[i];
      const fullPrompt = buildPrompt(title.trim(), emotion, style, aspectRatio, variation);
      const seed = Date.now() + i * 12345;

      if (selectedBrand === 'Tube.Flash') {
        // Fast free — Pollinations flux, no key
        const encoded = encodeURIComponent(fullPrompt);
        thumbnails.push(`https://image.pollinations.ai/prompt/${encoded}?width=${w}&height=${h}&nologo=true&seed=${seed}&model=flux`);
      } else if (selectedBrand === 'Tube.Pro') {
        // Balanced free — SnapGen (white-labeled Pollinations turbo enhanced) — no key required, higher quality than Flash
        const snapUrl = await genSnapGen(fullPrompt, w, h, seed);
        thumbnails.push(snapUrl);
      } else if (selectedBrand === 'Tube.Cinematic') {
        // Premium — Try Fal.ai first (requires FAL_API_KEY server env), fallback to SnapGen, then Pollinations
        const falUrl = await genFal(fullPrompt, fal);
        if (falUrl) {
          thumbnails.push(falUrl);
        } else {
          // Fallback to SnapGen if Fal not available or fails
          const snapUrl = await genSnapGen(fullPrompt, w, h, seed);
          thumbnails.push(snapUrl);
        }
      } else {
        // Unknown brand — default to Tube.Pro (SnapGen)
        const snapUrl = await genSnapGen(fullPrompt, w, h, seed);
        thumbnails.push(snapUrl);
      }
    }

    const successCount = thumbnails.filter(Boolean).length;
    if (successCount === 0) return jsonResponse({ error: 'All thumbnails failed' }, 502);

    return jsonResponse({
      thumbnails,
      dimensions: { width: w, height: h, ratio: aspectRatio },
      brand: selectedBrand,
      providerMap: {
        'Tube.Flash': 'pollinations (flux, free, 2-3s)',
        'Tube.Pro': 'snapgen (turbo enhanced, free, balanced, white-labeled)',
        'Tube.Cinematic': 'fal-ai/fast-lightning-sdxl (premium, requires FAL_API_KEY, fallback to snapgen)',
      },
    });

  } catch (e: any) {
    return jsonResponse({ error: e.message || 'Unknown' }, 500);
  }
}
