# SECURE ENVIRONMENT SETUP — Phase A3

**Status:** ✅ Complete — No client-side API keys, dual routing Supabase Edge + Vercel Edge

---

## Architecture Overview

```
Frontend (Vite React — Vercel Static)
  |
  |  Only sends:
  |   - VITE_SUPABASE_URL (public)
  |   - VITE_SUPABASE_PUBLISHABLE_KEY (anon, safe)
  |   - Optional: VITE_USE_VERCEL_EDGE=true to use /api/* Vercel Edge (faster US)
  |
  +---> Supabase Edge Functions (Deno) — server env Deno.env.get()
  |       /functions/v1/generate-content
  |       /functions/v1/generate-thumbnail
  |       /functions/v1/elevenlabs-tts
  |       etc.
  |
  +---> Vercel Edge Functions (Edge Runtime) — server env process.env
          /api/generate-text (TubeBot AI Agent)
          /api/generate-thumbnail (Tube.Flash / Tube.Pro mapping)
          /api/elevenlabs-tts (Voiceover Studio with preview MP3 saving)
          /api/transcript (YT transcript free)
          /api/config (public config, no secrets)
```

**Key Principle:** ALL provider keys (`GEMINI_API_KEY`, `FAL_API_KEY`, `ELEVENLABS_API_KEY`) live ONLY in `Deno.env` or `process.env` on server. Never in `localStorage`, never prefixed with `VITE_`.

---

## 1. Required Server Secrets

| Secret | Used By | Description | Cost Tier |
|--------|---------|-------------|-----------|
| `GEMINI_API_KEY` | generate-content, analyze-storyboard, vision-guide | Google AI Studio key for TubeBot + SEO + Vision | Free tier 60 RPM |
| `GOOGLE_AI_API_KEY` (alias) | Same as above | Fallback alias for Gemini | - |
| `FAL_API_KEY` | generate-thumbnail, generate-storyboard-image | Fal.ai for Tube.Pro (Pro quality) | Pay per image ~ $0.01 |
| `ELEVENLABS_API_KEY` | elevenlabs-tts | ElevenLabs for Voiceover Studio | Free 10k chars/mo |
| `LOCKER_URL` | config | Monetization locker / Stripe webhook URL | Optional |

---

## 2. Setting Secrets — Supabase Edge (Current Default)

```bash
# Install Supabase CLI
npm i -g supabase

# Login
supabase login

# Link project
supabase link --project-ref cssnxomfkrnjaedoobjj

# Set secrets (server-only, never exposed to frontend)
supabase secrets set GEMINI_API_KEY=AIza...
supabase secrets set FAL_API_KEY=...
supabase secrets set ELEVENLABS_API_KEY=sk_...
supabase secrets set LOCKER_URL=https://your-locker.com/verify

# Verify
supabase secrets list

# Deploy functions
supabase functions deploy generate-content --no-verify-jwt
supabase functions deploy generate-thumbnail --no-verify-jwt
supabase functions deploy elevenlabs-tts --no-verify-jwt
supabase functions deploy vision-guide --no-verify-jwt
supabase functions deploy analyze-storyboard --no-verify-jwt
supabase functions deploy generate-storyboard-image --no-verify-jwt
```

**Note:** `--no-verify-jwt` is for MVP — in production, enable JWT verification and add auth middleware in `_shared/cors.ts` + `_shared/secureKeys.ts`.

---

## 3. Setting Secrets — Vercel Edge (Faster US, Recommended for Pro)

If you want Vercel Edge (recommended for premium US audience — <50ms cold start, edge caching):

```bash
# In Vercel Dashboard: Project -> Settings -> Environment Variables
# Add:
GEMINI_API_KEY=AIza...
FAL_API_KEY=...
ELEVENLABS_API_KEY=sk_...
LOCKER_URL=https://...
VITE_SUPABASE_URL=https://cssnxomfkrnjaedoobjj.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbG...
VITE_USE_VERCEL_EDGE=true
VITE_API_MODE=vercel
```

Then `api/*.ts` files (created in Phase A3) will be auto-deployed as Vercel Edge Functions. Frontend `secureClient.ts` will automatically route to `/api/*` when `VITE_USE_VERCEL_EDGE=true`.

**Dual Routing Logic:**
```ts
// src/api/client/secureClient.ts
if (VITE_USE_VERCEL_EDGE === "true") {
  url = "/api/generate-text" // Vercel Edge — faster, US PoPs
} else {
  url = `${VITE_SUPABASE_URL}/functions/v1/generate-content` // Supabase Edge — default
}
```

---

## 4. Public (Safe) Client Env — .env

```
# Public — safe, anon key only
VITE_SUPABASE_URL=https://cssnxomfkrnjaedoobjj.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbG...
VITE_SUPABASE_PROJECT_ID=cssnxomfkrnjaedoobjj

# Toggle Vercel Edge vs Supabase Edge
VITE_USE_VERCEL_EDGE=false # set true to use /api/* Vercel Edge (faster)
VITE_API_MODE=supabase # or vercel

# App
VITE_APP_ENV=production
VITE_APP_URL=https://tubeclickpro.in
```

**Never add:**
```
VITE_GEMINI_API_KEY=... ❌ leaks to bundle
VITE_FAL_API_KEY=... ❌
VITE_ELEVENLABS_API_KEY=... ❌
```

Use `.env.example` as template — real `.env` is gitignored.

---

## 5. Image Model Mapping — Tube.Flash vs Tube.Pro (Phase C1 Prep)

Already blueprinted in `src/api/server/imageRouter.ts`:

- **Tube.Flash** → `pollinations` provider → `https://image.pollinations.ai/prompt/{prompt}` — FREE, no key, routed through server to hide logic, perfect for preview thumbnails
- **Tube.Pro** → `fal-ai/fast-lightning-sdxl` → requires `FAL_API_KEY` server env — premium quality, YouTube CTR optimized
- **Tube.Cinematic** → future `fal-ai/flux-pro` — storyboard filmic frames

Server decides based on `brand` string from client — client never knows provider keys.

---

## 6. Voice Preview MP3 Saving (Phase D1 Prep)

Blueprint in `src/api/server/voiceRouter.ts`:

- Frontend has `public/previews/voices/` with 2-3 sec static MP3 samples per voice (Atlas.mp3, Luna.mp3 etc)
- On voice selection, plays local preview — 0 API calls
- Only on final Generate does it call `/api/elevenlabs-tts` (server env key)
- Reduces ElevenLabs calls by ~80% — critical for SaaS margins

**To add previews:**
```
mkdir -p public/previews/voices
# Add 3 sec samples: Atlas, Titan, Nova, Luna, Aria, etc.
```

---

## 7. Security Checklist for US Premium SaaS

- [x] No `localStorage` API keys
- [x] No `VITE_` prefix for provider secrets
- [x] All functions use server env only
- [x] `.env` gitignored, `.env.example` provided
- [x] Dual routing Supabase + Vercel Edge ready
- [x] CORS structure ready for strict origin (change `*` to `ALLOWED_ORIGINS` in prod)
- [ ] Rotate Supabase anon key (was previously committed in .env) — do in Supabase Dashboard -> API -> Reset anon key
- [ ] Enable JWT verification on Supabase functions for Pro tier guard
- [ ] Add rate limiting per user (future Stripe webhook)

---

## 8. Deployment

**Vercel (Recommended):**
```bash
vercel --prod
# Set env vars in dashboard, enable Edge Functions
```

**Supabase (Current):**
```bash
supabase functions deploy --no-verify-jwt
```

**Testing:**
```bash
npm run build # Should show chunked assets, no BYOK refs
npm run preview
curl -X POST https://your-project.supabase.co/functions/v1/generate-content \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"topic":"AI","platform":"YouTube","style":"Dramatic","language":"english"}'
```

---

**Ready for Phase B — The Brain (Text & Data Pipeline)**
