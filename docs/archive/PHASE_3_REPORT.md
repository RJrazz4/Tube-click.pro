# PHASE 3 — Generator Agent (Multi-Provider Image Generation + Fallback) — REPORT

**Date:** 2026-07-18
**Status:** ✅ COMPLETED
**Branch:** `feat/phase-3-generator`
**Typecheck:** Pending (tsconfig paths to be finalized)

---

## Objective

Build a robust, multi-provider image generation engine with automatic failover. The system supports key rotation per provider, ordered provider fallback chains, parallel batch generation, and a zero-auth Pollinations fallback as the ultimate safety net.

---

## What Was Built

### Step 3.1 — Provider Adapters (`packages/ai/providers/`)

**Common `ImageProvider` Interface** (`types.ts`):
- `GenerateParams` — standardised prompt, dimensions, seed, count
- `GenerateResult{ images, provider, latencyMs }` — uniform output shape
- `ProviderMeta` — optional model name, degradation flags, info string
- Typed error hierarchy:
  - `RateLimitError` — per-minute limit, carries `retryAfter`
  - `QuotaExceededError` — daily/hard quota exhausted
  - `ProviderAuthError` — invalid/revoked API key
  - `ProviderUnavailableError` — upstream 5xx / down
  - `AllKeysExhaustedError` — all keys for a provider spent
- Narrow type-guards (`isRateLimitError`, etc.) for catch-clause discrimination

**AgnesFlashAdapter** (`agnes-flash-adapter.ts`):
- Premium adapter wrapping a configurable image-generation API
- Reads `AGNES_FLASH_API_URL`, `AGNES_FLASH_API_KEYS` (comma-separated), `AGNES_FLASH_MODEL`
- Built-in `KeyRotator`: on 429 → rotate; on 402/403 → rotate; on 401 → rotate; on 5xx → brief backoff then rotate
- Falls back through all keys before surfacing `AllKeysExhaustedError`
- Works in both Vercel Edge (`process.env`) and Supabase Edge (`Deno.env`) runtimes

**GeminiFlashAdapter** (`gemini-flash-adapter.ts`):
- Wraps Google Gemini's `generateContent` endpoint with `responseModalities: ["Image", "Text"]`
- Reads `GEMINI_API_KEYS` (comma-separated), `GEMINI_FLASH_API_URL`, `GEMINI_FLASH_MODEL`
- **Daily-quota detection**: classifies 429 with daily language → `QuotaExceededError` (instant failover, no sleep)
- **Per-minute detection**: honors `retryAfter` hint from server
- Extracts base64 inline images → data URIs for the orchestrator

### Step 3.3 — PollinationsAdapter (`pollinations-adapter.ts`)

- **Zero authentication** — direct URL-based generation via `image.pollinations.ai/prompt/{...}`
- No API keys, no `KeyRotator`, no rate-limit errors
- Generates N distinct URLs by incrementing the `seed` parameter (1 request = N variations)
- Lazy-loaded by `<img>` tags — URLs are valid immediately
- Always available; the orchestrator's ultimate safety net

### Step 3.2 — Generator Orchestrator (`packages/ai/generator.ts`)

**`GeneratorOrchestrator` class:**

```
Constructor(providers[], rotators Map, fallback?)
  → Ordered provider chain
  → Optional KeyRotators (keyed by provider name)
  → Ultimate Pollinations fallback (auto-created if omitted)

.generate(params, options) → GenerationReport
  ──────────────────────────────────────────
  1. Parallel batch — each image slot is an independent Promise
  2. For each slot:
     a. Try providers in order
     b. 429/402/403/401 → KeyRotator.rotate() → retry same provider
     c. AllKeysExhaustedError → move to next provider
     d. ALL providers failed → Pollinations fallback
     e. Fallback also failed → empty placeholder + degraded flag
  3. Collect results via Promise.allSettled (never throws)
```

**`GenerationReport` return shape:**
```ts
{
  images: ImageProvenance[]     // Per-image: url, provider, fromFallback, meta
  usedFallback: boolean          // True if any image came from Pollinations
  degraded: boolean              // True if any provider had errors
  providersAttempted: string[]   // Ordered list of providers contacted
  totalLatencyMs: number         // Total wall-clock time
  providerDetails: Record<string, { latencyMs, info? }>
}
```

**Key design decisions:**
- **Parallel, not serial**: Each image slot is generated independently so slow providers don't block the batch
- **Promise.allSettled**: Partial results are returned on failure (not an all-or-nothing throw)
- **Rotator per provider**: Each authenticated provider holds its own `KeyRotator` — key exhaustion on one doesn't affect others
- **Idempotent seed generation**: `seed = baseSeed + slotIndex` ensures reproducible batches

### Supporting Infrastructure

**KeyRotator** (`key-rotator.ts`):
- Round-robin rotation with exhaustion tracking
- `rotate()` throws `AllKeysExhaustedError` when every key is spent
- `tryRotate()` returns boolean (no-throw convenience)
- `reset()` re-enables all keys after a successful generation
- `available` / `total` getters for health checks

**Tier Config** (`packages/shared/tier.ts`):
- Free: max 4 scenes, Tube.Flash only, draft quality, watermark
- Premium: unlimited scenes, all brands + providers, high quality, no watermark
- `getTierLimits()`, `exceedsSceneLimit()`, `clampByTier()` helpers

---

## File Changes

**New files (8):**

| File | Purpose |
|------|---------|
| `packages/ai/providers/types.ts` | Common `ImageProvider` interface, typed error hierarchy |
| `packages/ai/providers/key-rotator.ts` | Round-robin API key rotation with exhaustion tracking |
| `packages/ai/providers/agnes-flash-adapter.ts` | Premium adapter with key rotation (configurable API) |
| `packages/ai/providers/gemini-flash-adapter.ts` | Google Gemini Flash image adapter with key rotation |
| `packages/ai/providers/pollinations-adapter.ts` | Free fallback adapter (zero auth, URL-based) |
| `packages/ai/providers/index.ts` | Barrel export for the providers package |
| `packages/ai/generator.ts` | Generator Orchestrator — parallel batch + fallback chain |
| `packages/shared/tier.ts` | Tier config (FREE/PREMIUM limits) |

---

## Next — Phase 4

**Phase 4: Business Logic & API Layer** builds on this foundation:
- **Step 4.1**: Tier Config (✅ already created in this phase as `packages/shared/tier.ts`)
- **Step 4.2**: API Routes — `POST /v1/storyboard` in `apps/api/src/routes/`
- **Step 4.3**: Request validation — truncate scenes exceeding tier limits

Ready for approval to proceed to Phase 4.
