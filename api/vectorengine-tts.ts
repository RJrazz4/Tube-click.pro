/**
 * Vercel Edge — /api/vectorengine-tts — Phase D1
 * VectorEngine API white-label wrapper around ElevenLabs
 * Server: ELEVENLABS_API_KEY (mapped as VectorEngine in white-label)
 * For TubeGenius Pro, VectorEngine = ElevenLabs but branded as Neural Engine
 * Also supports future VectorEngine provider if VECTORENGINE_API_KEY set
 */
export const config = { runtime: 'edge' };

import { corsHeaders, jsonResponse, safeJsonBody } from './_shared.js';

const VOICES: Record<string, string> = {
  'george': 'JBFqnCBsd6RMkjVDRZzb',
  'sarah': 'EXAVITQu4vr4xnSDxMaL',
  'laura': 'FGY2WhTYpPnrIDTdsKH5',
  'charlie': 'IKne3meq5aSn9XLyUdCD',
  'brian': 'nPczCjzI2devNBz1zQrb',
  'daniel': 'onwK4e9ZLuTAKqWW03F9',
  'liam': 'TX3LPaxmHKxFdv7VOQHJ',
  'alice': 'Xb7hH8MSUJpSbSDYk0k2',
  'matilda': 'XrExE9yKIg1WjnnlVkGX',
  'will': 'bIHbv24MWmeRgasZH58o',
  'jessica': 'cgSgspJ2msm6clMCkdW9',
  'eric': 'cjVigY5qzO86Huf0OWal',
  'chris': 'iP95p4xoKVk53GoZ742B',
  'lily': 'pFZP5JQG7iQjIQuC4Bku',
};

function requireEnv(key: string): string {
  const val = process.env[key] || '';
  if (!val) throw new Error(`${key} not configured`);
  return val;
}

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const body = await safeJsonBody(req);
    if (body.error) return jsonResponse({ error: body.error }, 400);
    const { text, voiceId, stability, similarityBoost, speed } = body.data;
    if (!text || !text.trim()) return jsonResponse({ error: 'Text required' }, 400);
    if (text.length > 5000) return jsonResponse({ error: 'Max 5000 chars' }, 400);

    // Try VectorEngine key first, fallback to ElevenLabs key — white-label strategy
    let apiKey = '';
    try { apiKey = requireEnv('VECTORENGINE_API_KEY'); } catch { try { apiKey = requireEnv('ELEVENLABS_API_KEY'); } catch { return jsonResponse({ error: 'VOICE_API_KEY not configured (ELEVENLABS_API_KEY or VECTORENGINE_API_KEY)' }, 500); } }

    const resolved = VOICES[voiceId?.toLowerCase()] || voiceId || VOICES['george'];

    const elRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${resolved}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: stability ?? 0.5, similarity_boost: similarityBoost ?? 0.75, style: 0.5, use_speaker_boost: true, speed: speed ?? 1.0 },
      }),
    });

    if (!elRes.ok) {
      const err = await elRes.text();
      return jsonResponse({ error: err || `Voice API ${elRes.status}` }, elRes.status);
    }

    const buf = await elRes.arrayBuffer();
    return new Response(buf, { status: 200, headers: { ...corsHeaders, 'Content-Type': 'audio/mpeg', 'X-Provider': 'VectorEngine (white-labeled ElevenLabs)', 'X-WhiteLabel': 'TubeGenius Neural Engine' } });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[vectorengine-tts] error:', msg);
    return jsonResponse({ error: msg || 'Unknown error', service: 'vectorengine-tts' }, 500);
  }
}
