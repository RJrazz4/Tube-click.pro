/**
 * Vercel Edge — POST /api/elevenlabs-tts
 *
 * Secure voice generation via ElevenLabs. Short static preview MP3s are
 * served from the client (public/previews/voices/) to eliminate ~80% of
 * billable calls; full generation uses the server-side
 * ELEVENLABS_API_KEY.
 */
export const config = { runtime: 'edge' };

import { corsHeaders, requireEnv, jsonResponse, safeJsonBody, timeoutSignal } from './_shared.js';

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

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const body = await safeJsonBody(req);
    if (body.error) return jsonResponse({ error: body.error }, 400);
    const { text, voiceId, stability, similarityBoost, speed } = body.data;
    if (!text || !text.trim()) return jsonResponse({ error: 'Text required', code: 'VOICE_BAD_REQUEST' }, 400);
    if (text.length > 5000) return jsonResponse({ error: 'Max 5000 chars', code: 'VOICE_BAD_REQUEST' }, 400);
    if (typeof stability === 'number' && (stability < 0 || stability > 1)) return jsonResponse({ error: 'Stability must be between 0 and 1', code: 'VOICE_BAD_REQUEST' }, 400);
    if (typeof speed === 'number' && (speed < 0.7 || speed > 1.2)) return jsonResponse({ error: 'Speed must be between 0.7 and 1.2', code: 'VOICE_BAD_REQUEST' }, 400);

    let apiKey: string;
    try {
      apiKey = requireEnv('ELEVENLABS_API_KEY');
    } catch {
      return jsonResponse({ error: 'Voice generation is not configured.', code: 'VOICE_NOT_CONFIGURED' }, 503);
    }
    const resolved = VOICES[voiceId?.toLowerCase()] || VOICES['george'];
    const upstream = timeoutSignal(25_000);

    let elRes: Response;
    try {
      elRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${resolved}?output_format=mp3_44100_128`, {
        method: 'POST',
        headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: stability ?? 0.5,
            similarity_boost: similarityBoost ?? 0.75,
            style: 0.5,
            use_speaker_boost: true,
            speed: speed ?? 1.0,
          },
        }),
        signal: upstream.signal,
      });
    } catch (error) {
      const timedOut = error instanceof DOMException && error.name === 'AbortError';
      return jsonResponse({
        error: timedOut ? 'Voice provider timed out. Please try again.' : 'Voice provider could not be reached.',
        code: timedOut ? 'VOICE_TIMEOUT' : 'VOICE_UPSTREAM_ERROR',
      }, timedOut ? 504 : 502);
    } finally {
      upstream.clear();
    }

    if (!elRes.ok) {
      const status = elRes.status;
      const code = status === 401 || status === 403 ? 'VOICE_AUTH_FAILED' : status === 429 ? 'VOICE_RATE_LIMITED' : 'VOICE_PROVIDER_ERROR';
      return jsonResponse({ error: 'Voice provider rejected the request.', code }, status >= 500 ? 502 : status);
    }

    const buf = await elRes.arrayBuffer();
    return new Response(buf, { status: 200, headers: { ...corsHeaders, 'Content-Type': 'audio/mpeg' } });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[elevenlabs-tts] error:', msg);
    return jsonResponse({ error: msg || 'Unknown error', service: 'elevenlabs-tts' }, 500);
  }
}
