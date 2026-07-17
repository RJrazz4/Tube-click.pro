/**
 * Vercel Edge — /api/vectorengine-tts — Phase D1
 * VectorEngine API white-label wrapper around ElevenLabs
 * Server: ELEVENLABS_API_KEY (mapped as VectorEngine in white-label)
 * For TubeGenius Pro, VectorEngine = ElevenLabs but branded as Neural Engine
 * Also supports future VectorEngine provider if VECTORENGINE_API_KEY set
 */
export const config = { runtime: 'edge' };

import { corsHeaders } from './_shared';

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
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const { text, voiceId, stability, similarityBoost, speed } = await req.json();
    if (!text || !text.trim()) return new Response(JSON.stringify({ error: 'Text required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (text.length > 5000) return new Response(JSON.stringify({ error: 'Max 5000 chars' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // Try VectorEngine key first, fallback to ElevenLabs key — white-label strategy
    let apiKey = '';
    try { apiKey = requireEnv('VECTORENGINE_API_KEY'); } catch { try { apiKey = requireEnv('ELEVENLABS_API_KEY'); } catch { return new Response(JSON.stringify({ error: 'VOICE_API_KEY not configured (ELEVENLABS_API_KEY or VECTORENGINE_API_KEY)' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); } }

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
      return new Response(JSON.stringify({ error: err || `Voice API ${elRes.status}` }), { status: elRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const buf = await elRes.arrayBuffer();
    return new Response(buf, { status: 200, headers: { ...corsHeaders, 'Content-Type': 'audio/mpeg', 'X-Provider': 'VectorEngine (white-labeled ElevenLabs)', 'X-WhiteLabel': 'TubeGenius Neural Engine' } });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || 'Unknown' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}
