/**
 * Vercel Edge — /api/config
 * Returns public config — locker URL, feature flags, subscription tiers
 * NO secrets ever returned — keys stay server-only
 */
export const config = { runtime: 'edge' };

import { jsonResponse, corsHeaders } from './_shared.js';

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    // Public config — safe to expose
    // In production, this could read from Supabase or Stripe
    const lockerUrl = process.env.LOCKER_URL || "";

    return jsonResponse({
      lockerUrl,
      features: {
        transcript: true,
        thumbnails: true,
        voice: true,
        storyboard: true,
        seo: true,
      },
      tiers: {
        free: { maxGenerationsPerDay: 10, watermark: true },
        pro: { maxGenerationsPerDay: 500, watermark: false, priority: true },
        enterprise: { maxGenerationsPerDay: 9999, watermark: false, priority: true, support: 'dedicated' },
      },
      version: '2.0-secure',
      env: process.env.VERCEL_ENV || 'development',
    });

  } catch (e: any) {
    return jsonResponse({ error: e.message }, 500);
  }
}
