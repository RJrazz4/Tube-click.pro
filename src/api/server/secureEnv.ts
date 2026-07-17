/**
 * Secure Environment Setup — Phase A3 Blueprint
 * Documents how all external API calls route through secure serverless routes
 * using environment variables — no client-side keys.
 * 
 * This is the core security contract for US premium SaaS.
 */

export const SECURE_ENV_CONTRACT = {
  principle: "Never expose provider keys in frontend bundle or localStorage",
  serverEnv: {
    "GEMINI_API_KEY": "Google AI Studio — TubeBot, SEO, Transcript, Storyboard analysis",
    "FAL_API_KEY": "Fal.ai — Thumbnails + Storyboard images (Tube.Pro)",
    "ELEVENLABS_API_KEY": "ElevenLabs — Voiceover Studio (with preview MP3 saving)",
  },
  publicEnv: {
    "VITE_SUPABASE_URL": "Public — Supabase project URL",
    "VITE_SUPABASE_PUBLISHABLE_KEY": "Public — anon key, safe to expose, used only as gateway auth",
    "VITE_USE_VERCEL_EDGE": "Toggle — true uses /api/* Vercel Edge (faster US), false uses Supabase Edge",
  },
  forbidden: [
    "VITE_GEMINI_API_KEY",
    "VITE_FAL_API_KEY",
    "VITE_ELEVENLABS_API_KEY",
    "localStorage 'gemini-api-key'",
    "localStorage 'fal-api-key'",
    "customApiKey in request body",
  ],
  routes: {
    supabase: {
      "generate-content": "/functions/v1/generate-content",
      "generate-thumbnail": "/functions/v1/generate-thumbnail",
      "elevenlabs-tts": "/functions/v1/elevenlabs-tts (blob)",
      "vision-guide": "/functions/v1/vision-guide",
      "analyze-storyboard": "/functions/v1/analyze-storyboard",
      "transcript": "/functions/v1/transcript (future)",
    },
    vercel: {
      "generate-content": "/api/generate-text (edge)",
      "generate-thumbnail": "/api/generate-thumbnail (edge, brand mapping)",
      "elevenlabs-tts": "/api/elevenlabs-tts (edge, blob)",
      "vision-guide": "/api/vision-guide (edge)",
      "analyze-storyboard": "/api/analyze-storyboard (edge)",
      "transcript": "/api/transcript (edge, free youtube-transcript)",
      "config": "/api/config (public, no secrets)",
    },
  },
  client: {
    file: "src/api/client/secureClient.ts",
    logic: "getApiEndpoint() checks VITE_USE_VERCEL_EDGE and routes accordingly. Never sends customApiKey.",
    caching: "React Query staleTime 5m, gcTime 10m + Zustand store for instant UI",
  },
  deployment: {
    supabase: "supabase secrets set GEMINI_API_KEY=... && supabase functions deploy --no-verify-jwt",
    vercel: "Vercel Dashboard -> Settings -> Environment Variables, add server keys, enable Edge runtime",
  },
  securityChecklist: [
    "No BYOK files",
    ".env gitignored",
    ".env.example documents server-only keys",
    "All Supabase functions use Deno.env only",
    "All Vercel api/*.ts use process.env only",
    "secureClient never includes customApiKey",
    "CORS ready for strict origin via ALLOWED_ORIGINS",
    "Locker URL via /api/config public endpoint, not via env leak",
  ],
};

export const VERCEL_EDGE_BENEFITS = {
  performance: "Edge PoPs in US — <50ms cold start, edge caching, faster than Supabase Edge for US audience",
  smoothness: "Instant API responses, better LCP for premium subscription model",
  scalability: "Auto-scales, no Deno cold start, native Next.js App Router compatible",
  future: "Easy to add Stripe webhook middleware for paywall locker in same /api/* layer",
};
