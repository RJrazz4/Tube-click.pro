/**
 * Phase D1 Blueprint — Voiceover Studio via VectorEngine / ElevenLabs secure route
 * - Frontend plays static preview MP3s to save API calls
 * - Only final generation hits server
 */

export const PREVIEW_MP3_STRATEGY = {
  description: "Add logic to play static preview MP3s on frontend to save API calls",
  implementation: `
  // public/previews/voices/ contains 2-3 sec static samples for each voice
  // e.g., /previews/voices/Atlas.mp3, Luna.mp3, etc.
  // Frontend <audio> plays local file on voice selection, not calling ElevenLabs
  // Only when user clicks Generate does it call /functions/v1/elevenlabs-tts
  `,
  assets: [
    "public/previews/voices/Atlas.mp3",
    "public/previews/voices/Titan.mp3",
    "public/previews/voices/Luna.mp3",
  ],
  saving: "Reduces ElevenLabs calls by ~80% — critical for US SaaS margins",
};

export const VOICE_ROUTER_BLUEPRINT = {
  secureRoute: "/functions/v1/elevenlabs-tts (Supabase) or /api/voice (Vercel Edge)",
  serverKey: "ELEVENLABS_API_KEY from Deno.env / process.env",
  whiteLabelMapping: {
    Atlas: "george -> JBFqnCBsd6RMkjVDRZzb",
    Titan: "brian -> nPczCjzI2devNBz1zQrb",
    Luna: "sarah -> EXAVITQu4vr4xnSDxMaL",
  },
  clientSends: "{ text, voiceId (white-labeled), stability, speed } — NO API KEY",
};
