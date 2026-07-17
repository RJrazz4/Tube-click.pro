/**
 * Vercel Edge — /api/generate-storyboard-image
 * Server: FAL_API_KEY — same logic as Supabase version but Vercel Edge (faster US)
 */
export const config = { runtime: 'edge' };
import { jsonResponse, requireEnv, corsHeaders } from './_shared';

async function genFal(prompt: string, key: string): Promise<string> {
  const submit = await fetch('https://queue.fal.run/fal-ai/fast-lightning-sdxl', {
    method: 'POST',
    headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, image_size: 'landscape_16_9', num_inference_steps: 4, num_images: 1, enable_safety_checker: false }),
  });
  if (!submit.ok) throw new Error(`Fal ${submit.status}`);
  const { request_id } = await submit.json();
  const start = Date.now();
  while (Date.now() - start < 30000) {
    await new Promise(r => setTimeout(r, 1000));
    const st = await fetch(`https://queue.fal.run/fal-ai/fast-lightning-sdxl/requests/${request_id}/status`, { headers: { Authorization: `Key ${key}` } });
    if (!st.ok) continue;
    const j = await st.json();
    if (j.status === 'COMPLETED') {
      const res = await fetch(`https://queue.fal.run/fal-ai/fast-lightning-sdxl/requests/${request_id}`, { headers: { Authorization: `Key ${key}` } });
      const data = await res.json();
      return data.images?.[0]?.url;
    }
    if (j.status === 'FAILED') throw new Error('Fal failed');
  }
  throw new Error('Timeout');
}

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
  try {
    const { prompt, sceneNumber } = await req.json();
    if (!prompt) return jsonResponse({ error: 'Prompt required' }, 400);
    const key = requireEnv('FAL_API_KEY');
    const imageUrl = await genFal(prompt, key);
    return jsonResponse({ imageUrl, sceneNumber });
  } catch (e: any) {
    return jsonResponse({ error: e.message }, 500);
  }
}
