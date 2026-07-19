/**
 * Vercel Edge — /api/generate-thumbnail — PURGED
 * Feature removed for cost optimization and system cleanup.
 */
export const config = { runtime: 'edge' };
import { jsonResponse, corsHeaders } from './_shared.js';

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  return jsonResponse({ error: 'Thumbnail generation feature purged for system cleanup and cost optimization.' }, 503);
}
