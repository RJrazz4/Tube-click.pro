# Environment & Secrets

All runtime configuration is loaded from environment variables. The file `.env.example` is the authoritative template; copy it to `.env` for local development and configure the same variables in your deployment platform (Vercel dashboard) for production.

**The single most important rule:** any variable whose name begins with `VITE_` is inlined into the client JavaScript bundle at build time. **Never** put a secret behind a `VITE_` name. Server-only variables (all provider keys, database service roles, webhook secrets) are read by Vercel/Supabase functions via `process.env` / `Deno.env` and are never exposed.

---

## Variable Reference

Variables are grouped below by concern. Required variables are marked **(required)**.

### 1. Application Identity (public, safe to ship to client)

| Variable | Example | Purpose |
|---|---|---|
| `VITE_APP_URL` | `https://tubeclickpro.in` | Canonical public URL; used for OAuth redirects, referral links, and canonical `<meta>` tags. |
| `VITE_APP_ENV` | `production` | `development` / `staging` / `production`; toggles debug UI and analytics sampling. |
| `VITE_SUPABASE_URL` | `https://xxxx.supabase.co` | Supabase project URL. **(required)** |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `eyJhbG...` | Supabase anon (publishable) key. This is safe to ship — RLS enforces access. **(required)** |
| `VITE_SUPABASE_PROJECT_ID` | `cssnxomfkrnjaedoobjj` | Supabase project ref; used for link generation and dashboard deeplinks. |
| `VITE_USE_VERCEL_EDGE` | `true` | When `true`, the client routes AI calls to `/api/*` Vercel functions; when `false`, falls back to Supabase Edge Functions. |
| `VITE_API_MODE` | `vercel` | `vercel` or `supabase` — informational label surfaced in debug UI. |

### 2. Supabase (server-only)

| Variable | Example | Purpose |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbG...` | Service-role JWT; bypasses RLS for server-to-server RPCs. Keep out of the client. **(required)** |
| `SUPABASE_JWT_SECRET` | (auto-provided on Supabase) | Used to verify signed cookies and webhooks. |

### 3. Primary AI Provider — OpenRouter

OpenRouter is the default route for chat, SEO, storyboard planning, and Clone & Crush. Multiple keys can be supplied comma-separated; the orchestrator rotates them round-robin and applies per-key cooldown on 429/402.

| Variable | Example | Purpose |
|---|---|---|
| `OPENROUTER_API_KEYS` | `sk-or-v1-aaa,sk-or-v1-bbb` | Comma-separated keys. **(required)** |
| `OPENROUTER_API_KEY` | `sk-or-v1-xxx` | Legacy singular alias; used only if `OPENROUTER_API_KEYS` is unset. |
| `OPENROUTER_API_KEY_1..N` | `sk-or-v1-xxx` | Numbered form; accepted as a fallback. |
| `OPENROUTER_MODEL` | `google/gemini-2.5-flash` | Primary chat/model director model. Defaults to Gemini 2.5 Flash for quality/cost. |
| `OPENROUTER_MODEL_FALLBACKS` | `google/gemini-2.0-flash,meta-llama/llama-3.1-8b-instruct` | Ordered failover list if the primary exhausts or errors. |
| `OPENROUTER_CHAT_ATTEMPT_TIMEOUT_MS` | `7000` | Per-call abort timeout for chat generation. |
| `OPENROUTER_ATTEMPT_TIMEOUT_MS` | `15000` | Per-call abort timeout for SEO/storyboard/clone-crush. |
| `OPENROUTER_MAX_ATTEMPTS` | `3` | Maximum attempts across keys before falling back to synthetic response. |
| `OPENROUTER_SITE_URL` | `https://tubeclickpro.in` | Sent as `HTTP-Referer` to OpenRouter for leaderboard attribution. |
| `OPENROUTER_SITE_TITLE` | `TubeClick Pro` | Sent as `X-Title` to OpenRouter. |

### 4. Secondary AI / Media Providers

All optional — the orchestrator degrades gracefully when a key is absent.

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Google Gemini Flash adapter (alternative director model; used as redundancy path). |
| `GOOGLE_AI_API_KEY` | Alias for `GEMINI_API_KEY`. |
| `FAL_API_KEY` | Fal.ai image generation (Pro/Cinematic thumbnail and storyboard frames). |
| `REPLICATE_API_TOKEN` | Replicate adapter for image generation fallback. |
| `TOGETHER_API_KEY` | Together AI adapter (free-tier chat/image fallback). |
| `HUGGINGFACE_API_KEY` | HuggingFace Inference adapter (image fallback). |
| `AGNES_API_KEY` | Agnes Flash adapter (configured private provider). |
| `POLLINATIONS_BASE_URL` | Override for Pollinations; normally not required (no key, free). |
| `ELEVENLABS_API_KEY` | ElevenLabs TTS for the Voiceover Studio. Free tier allows ~10k chars/month. |

### 5. YouTube

| Variable | Purpose |
|---|---|
| `YOUTUBE_API_KEY` | YouTube Data API v3 key for Clone & Crush channel analysis and competitor discovery. **(required for Clone & Crush)** |

The transcript endpoint falls back through three paths (library → Piped API → synthetic scaffold) so a missing YouTube key does not break transcript retrieval, only channel analysis.

### 6. Monetization / Referral Policy

| Variable | Purpose |
|---|---|
| `LOCKER_URL` | URL of the payment/license verification endpoint (server-to-server); used by `/api/config` and tier checks. |
| `REFERRAL_SIGNING_SECRET` | HMAC secret for signing referral cookies and share tokens. **(required in production)** |
| `REFERRAL_REQUIRED_INVITES` | Default `3`. Invites required before a referrer qualifies. |
| `REFERRAL_REQUIRED_UNLOCKS` | Default `1`. Invitees who must themselves unlock Pro before the referrer qualifies. |
| `PRO_TRIAL_DAYS` | Default `7`. Length of the Pro pass granted on successful referral. |

### 7. Operational Knobs

| Variable | Purpose |
|---|---|
| `ALLOWED_ORIGINS` | Comma-separated list of origins permitted in CORS responses (production). If unset, permissive during dev. |
| `RATE_LIMIT_FREE_RPM` | Requests per minute for anonymous/free users (default tuned for free-tier margins). |
| `RATE_LIMIT_PRO_RPM` | RPM for authenticated Pro users. |
| `LOG_LEVEL` | `debug` / `info` / `warn` / `error`; defaults to `info`. |

---

## Setting Secrets

### Local development

```bash
cp .env.example .env
# edit .env with your values
npm run dev
```

Vite loads `.env` automatically; serverless functions read from the same environment when invoked via `vercel dev` (recommended for full-stack local work) or via explicit `export $(grep -v '^#' .env | xargs)` for Node-based scripts.

### Vercel (production)

1. Open your Vercel project → **Settings → Environment Variables**.
2. Add every variable from the "server-only" sections above, scoped to **Production** (and Preview/Development as needed).
3. Add `VITE_*` variables to all environments (they are not secret).
4. Redeploy. Vercel will inject them into Edge and Node function runtimes automatically.

Do not commit `.env` (it is in `.gitignore`).

### Supabase

For Supabase Edge Function deployments (ancillary path):

```bash
supabase link --project-ref <project-id>
supabase secrets set OPENROUTER_API_KEYS=... SUPABASE_SERVICE_ROLE_KEY=... ...
supabase functions deploy <function-name>
```

## Rotating a Leaked Key

1. Issue a new key from the provider console.
2. Add the new key to `OPENROUTER_API_KEYS` (or the relevant provider var) in Vercel as the first entry.
3. Redeploy — the orchestrator will pick it up on next cold start.
4. Revoke the old key from the provider console.
5. Check `/api/v1/metrics` to confirm the new key is serving traffic before revoking.

## Verification

After configuration, confirm the runtime is healthy:

```bash
# Client builds without bundling a secret
npm run build && npm run verify

# Server health (production)
curl -s https://tubeclickpro.in/api/v1/tiers | jq .
curl -s https://tubeclickpro.in/api/v1/metrics | jq .status

# Smoke the chat path
curl -s -X POST https://tubeclickpro.in/api/generate-text \
  -H 'content-type: application/json' \
  -d '{"topic":"start a faceless YouTube channel","language":"english","platform":"youtube"}' | jq .
```
