# PHASE F1 — OpenRouter Migration with API-Key Rotation — REPORT

**Date:** 2026-07-17
**Status:** ✅ COMPLETED
**Gates:** `tsc` api PASS · `tsc` app 0 errors · `vite build` PASS (5.8s) · behavior matrix **25/25 PASS**
**Depends on:** E1–E4 (error envelopes, policy engine, typed client, clean types)

---

## Mission

Migrate all Vercel Edge **text-generation** from direct Gemini REST to **OpenRouter**
(OpenAI-compatible chat completions) with **multi-key rotation** to bypass single-key
quota ceilings.

## Architecture

```
generate-text / seo-tags / analyze-storyboard / vision-guide
  → fetchOpenRouterWithRetry(geminiStyleBody)          [api/_shared.ts]
      1. toOpenRouterBody()          Gemini-style body → OpenAI messages format
                                     (system maps to role:system, vision inlineData
                                      → image_url data URI, responseMimeType →
                                      response_format: json_object)
      2. openRouterKeys()            OPENROUTER_API_KEYS csv → trimmed, deduped array
      3. Rotation policy:
           MODEL loop:  google/gemini-2.0-flash → google/gemini-2.0-flash-lite
           KEY loop:    key1, key2, key3, ...   (per model, keys reset)
           429 quota/rate-limit ─┐
           402 credits ──────────┼→ INSTANT key rotate (zero sleep)
           401/403 key invalid ──┘
           Retry-After hdr → honored ONCE per (model,key) if ≤ 15s & within budget
           5xx             → one 1.5s backoff, same key, then rotate
           400             → fail fast (1 request)
      4. Error path unchanged: parseProviderError → safe envelope
         (+ new INSUFFICIENT_CREDITS code for 402)
      5. extractOpenRouterText() reads choices[0].message.content
```

Key material is **never** logged or returned — rotation logs reference `key#i/n` only.

## Files changed

| File | Change |
|---|---|
| `api/_shared.ts` | Gemini engine removed → `openRouterKeys/openRouterModelChain/toOpenRouterBody/extractOpenRouterText/fetchOpenRouterWithRetry` + `INSUFFICIENT_CREDITS` in normalizer |
| `api/generate-text.ts`, `api/seo-tags.ts`, `api/analyze-storyboard.ts`, `api/vision-guide.ts` | call OpenRouter engine; no URL-embedded keys; stale Gemini comments/helpers removed |
| `src/lib/friendlyError.ts` | `INSUFFICIENT_CREDITS` UI copy |
| `src/api/server/secureEnv.ts` | env contract: OPENROUTER_API_KEYS registered; GEMINI_API_KEY marked LEGACY (Supabase path only); VITE_OPENROUTER_API_KEYS forbidden |
| `src/pages/AdminPanel.tsx`, `src/pages/SeoOptimizer.tsx` | admin help text updated to OpenRouter vars |
| `.env.example` | OPENROUTER_API_KEYS documented + optional overrides |

**Legacy Gemini symbols are fully gone from `api/`** (grep-verified). Supabase functions
path untouched (inactive when `VITE_USE_VERCEL_EDGE=true`) and remains Gemini-based as
a historical fallback.

## Test evidence (25 scenarios)

- Key CSV parse/trim/dedupe; missing-env error names the variable ✅
- Converter: system/assistant/user roles, vision data-URI, JSON mode, temperature ✅
- R1: key1 429 → key2 200 same model, **0ms sleep** ✅
- R2: 2 keys × 429 → model fallback → 200 on lite ✅
- R3: 402+401 → full rotation (4 calls), clean exhausted failure, no key leakage ✅
- R4: 400 → exactly 1 call ✅ · R5: 500 → 1.5s retry ✅ · R6: `Retry-After: 1` honored ✅
- E2E through real handler: rotation success + outage envelope w/o internals + UI title ✅

## Required Vercel environment variables

| Var | Required | Example | Default if unset |
|---|---|---|---|
| `OPENROUTER_API_KEYS` | **YES** | `sk-or-v1-aaa,sk-or-v1-bbb,sk-or-v1-ccc` | — (requests fail with clear config error) |
| `OPENROUTER_MODEL` | no | `google/gemini-2.0-flash` | `google/gemini-2.0-flash` |
| `OPENROUTER_MODEL_FALLBACKS` | no | `google/gemini-2.0-flash-lite` | `google/gemini-2.0-flash-lite` |
| `AI_RETRY_BUDGET_MS` | no | `12000` | 12000 |

`GEMINI_API_KEY` is no longer read by Vercel Edge routes (safe to delete after verifying;
still needed only if you fall back to the Supabase functions path).
