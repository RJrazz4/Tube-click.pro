import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VOICES: Record<string, string> = {
  'roger': 'CwhRBWXzGAHq8TQ4Fs17',
  'sarah': 'EXAVITQu4vr4xnSDxMaL',
  'laura': 'FGY2WhTYpPnrIDTdsKH5',
  'charlie': 'IKne3meq5aSn9XLyUdCD',
  'george': 'JBFqnCBsd6RMkjVDRZzb',
  'callum': 'N2lVS1w4EtoT3dr4eOWO',
  'river': 'SAz9YHcvj6GT2YYXdXww',
  'liam': 'TX3LPaxmHKxFdv7VOQHJ',
  'alice': 'Xb7hH8MSUJpSbSDYk0k2',
  'matilda': 'XrExE9yKIg1WjnnlVkGX',
  'will': 'bIHbv24MWmeRgasZH58o',
  'jessica': 'cgSgspJ2msm6clMCkdW9',
  'eric': 'cjVigY5qzO86Huf0OWal',
  'chris': 'iP95p4xoKVk53GoZ742B',
  'brian': 'nPczCjzI2devNBz1zQrb',
  'daniel': 'onwK4e9ZLuTAKqWW03F9',
  'lily': 'pFZP5JQG7iQjIQuC4Bku',
  'bill': 'pqHfZKP75CvOlQylNhV4',
};

const RETRY_DELAYS = [2000, 5000];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, voiceId, stability, similarityBoost, speed } = await req.json();

    // SECURE: Server env only — VectorEngine white-label (VECTORENGINE_API_KEY) fallback to ELEVENLABS_API_KEY
    const ELEVENLABS_API_KEY = Deno.env.get('VECTORENGINE_API_KEY') || Deno.env.get('ELEVENLABS_API_KEY') || "";

    if (!ELEVENLABS_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: 'ELEVENLABS_API_KEY not configured on server.', action: 'Admin: set secrets.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!text || typeof text !== 'string' || !text.trim()) {
      return new Response(
        JSON.stringify({ success: false, error: 'Text is required.', action: 'Enter text.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (text.length > 5000) {
      return new Response(
        JSON.stringify({ success: false, error: 'Text too long (max 5000 chars).', action: 'Shorten text.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const voiceKey = voiceId?.toLowerCase();
    const resolvedVoiceId = VOICES[voiceKey] || voiceId || VOICES['george'];

    let lastError = 'Voice generation failed.';

    for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
      if (attempt > 0) {
        await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt - 1]));
      }

      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${resolvedVoiceId}?output_format=mp3_44100_128`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': ELEVENLABS_API_KEY,
            'Content-Type': 'application/json',
          },
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
        }
      );

      if (response.ok) {
        const audioBuffer = await response.arrayBuffer();
        return new Response(audioBuffer, {
          headers: { ...corsHeaders, 'Content-Type': 'audio/mpeg' },
        });
      }

      if (response.status === 401 || response.status === 403) {
        return new Response(
          JSON.stringify({ success: false, error: 'Server ElevenLabs key invalid.', action: 'Admin: check ELEVENLABS_API_KEY.' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (response.status === 429 && attempt < RETRY_DELAYS.length) continue;

      try {
        const errorData = await response.json();
        lastError = errorData?.detail?.message || errorData?.error || `Voice API error: ${response.status}`;
      } catch {
        lastError = `Voice API error: ${response.status}`;
      }

      if (attempt === RETRY_DELAYS.length) {
        return new Response(
          JSON.stringify({ success: false, error: lastError, action: 'Try again.' }),
          { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    return new Response(
      JSON.stringify({ success: false, error: lastError, action: 'Try again.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage, action: 'Try again.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
