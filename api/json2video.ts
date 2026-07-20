/**
 * Vercel Edge — /api/json2video — Phase D2 JSON2Video Assembly Pipeline
 * Secure route that forwards internal TubeClick Pro payload to JSON2Video API
 * Server: JSON2VIDEO_API_KEY (never client)
 * 
 * Flow:
 * 1. Frontend builds internal payload via buildPayloadFromAppState() (images + audio)
 * 2. POST to /api/json2video with { internalPayload } or directly { apiPayload }
 * 3. Server converts to JSON2Video API format + forwards with x-api-key
 * 4. Returns project ID for polling
 * 5. Webhook endpoint /api/webhook/json2video receives completion notification
 */
export const config = { runtime: 'edge' };

import { jsonResponse, corsHeaders, safeJsonBody } from './_shared.js';

function requireEnv(key: string): string {
  const val = process.env[key] || '';
  if (!val) throw new Error(`${key} not configured on server`);
  return val;
}

// Minimal validation for internal payload
function validateInternalPayload(body: any): { valid: boolean; error?: string } {
  if (!body) return { valid: false, error: 'Body required' };
  // Could be { internal: ... } or { api: ... } or direct api payload with scenes
  if (body.scenes && Array.isArray(body.scenes) && body.scenes.length > 0) return { valid: true };
  if (body.internal && body.internal.scenes) return { valid: true };
  if (body.api && body.api.scenes) return { valid: true };
  return { valid: false, error: 'Invalid payload — must contain scenes array or internal/api object' };
}

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed — POST { internal or api }' }, 405);

  try {
    const bodyResult = await safeJsonBody(req);
    if (bodyResult.error) return jsonResponse({ error: bodyResult.error }, 400);
    const body = bodyResult.data;
    const validation = validateInternalPayload(body);
    if (!validation.valid) return jsonResponse({ error: validation.error }, 400);

    let apiPayload: any;

    // If client sent internal payload, convert server-side (more secure — server decides final api format)
    if (body.internal) {
      // Import conversion logic dynamically? For edge, we duplicate minimal conversion
      // For full conversion, use toJson2VideoApiPayload from src/api/server/json2VideoPayload.ts
      // Here we trust client sent api payload already converted, or we do simple pass-through
      // In production, server should re-validate and convert via toJson2VideoApiPayload
      apiPayload = body.internal;
      // Simple conversion if client sent internal scenes structure
      if (apiPayload.scenes && apiPayload.voiceover) {
        // Convert internal to api format (simplified version of toJson2VideoApiPayload)
        const isVertical = apiPayload.resolution === '1080x1920';
        apiPayload = {
          id: apiPayload.meta?.projectId || `tg-${Date.now()}`,
          comment: `TubeClick Pro - ${apiPayload.meta?.topic || 'Video'} - ${apiPayload.scenes.length} scenes`,
          resolution: isVertical ? 'custom' : 'full-hd',
          width: isVertical ? 1080 : 1920,
          height: isVertical ? 1920 : 1080,
          quality: apiPayload.meta?.tier === 'free' ? 'medium' : 'high',
          draft: true,
          scenes: apiPayload.scenes.map((s: any, idx: number) => ({
            comment: `Scene ${s.sceneNumber}`,
            duration: s.duration || 3,
            elements: [
              { type: 'image', src: s.imageUrl, duration: s.duration || 3 },
            ],
          })),
        };
      }
    } else if (body.api) {
      apiPayload = body.api;
    } else {
      // Direct api payload
      apiPayload = body;
    }

    // If no JSON2VIDEO_API_KEY set, return blueprint + payload for testing (don't fail)
    const apiKey = process.env.JSON2VIDEO_API_KEY;
    if (!apiKey) {
      return jsonResponse({
        message: 'JSON2VIDEO_API_KEY not configured — returning payload blueprint for testing (draft mode)',
        blueprint: true,
        projectId: apiPayload.id || `tg-${Date.now()}`,
        payload: apiPayload,
        nextSteps: [
          'Set JSON2VIDEO_API_KEY in Vercel Dashboard or supabase secrets set JSON2VIDEO_API_KEY=...',
          'POST payload to https://api.json2video.com/v2/movies with x-api-key header',
          'Poll GET https://api.json2video.com/v2/movies?project=tg-... for status',
          'Setup webhook at /api/webhook/json2video to receive { url, duration, size } when render completes',
        ],
        exampleCurl: `curl -X POST https://api.json2video.com/v2/movies -H "x-api-key: YOUR_KEY" -H "Content-Type: application/json" -d '${JSON.stringify(apiPayload).slice(0, 200)}...'`,
      });
    }

    // Forward to JSON2Video API
    const j2vRes = await fetch('https://api.json2video.com/v2/movies', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(apiPayload),
    });

    if (!j2vRes.ok) {
      const errText = await j2vRes.text();
      return jsonResponse({ error: `JSON2Video API error ${j2vRes.status}: ${errText}`, payload: apiPayload }, j2vRes.status);
    }

    const j2vData = await j2vRes.json();

    return jsonResponse({
      success: true,
      project: j2vData.project || apiPayload.id,
      message: 'Rendering job started — poll status via GET /api/json2video?project=... or setup webhook',
      json2videoResponse: j2vData,
      pollUrl: `https://api.json2video.com/v2/movies?project=${j2vData.project || apiPayload.id}`,
      webhookSetup: 'POST your webhook URL in payload.exports.destinations[0].endpoint to get notified when video ready at https://assets.json2video.com/...mp4',
    });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[json2video] error:', msg);
    return jsonResponse({ error: msg || 'Internal server error', action: 'Check payload format and JSON2VIDEO_API_KEY env', service: 'json2video' }, 500);
  }
}
