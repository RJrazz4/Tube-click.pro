# PHASE E1 — Provider Error Normalization (Vercel Edge) — REPORT

**Date:** 2026-07-17
**Status:** ✅ COMPLETED
**Typecheck:** `tsc -p tsconfig.api.json` — Passing
**Smoke tests:** 16/16 passing (real captured Gemini 429 payloads)
**Rollback point:** git tag `pre-quota-fix-rollback` (a6e8c4c)

---

## Problem

When Gemini returned **429 RESOURCE_EXHAUSTED** (quota exceeded), the Vercel Edge
functions passed the provider's **entire raw JSON error payload** (~2KB) through to
the client as the `error` field. The frontend rendered that string directly, producing
the "massive raw JSON error block" on the UI.

Root cause (pre-fix), `api/generate-text.ts` and `api/seo-tags.ts`:

```ts
if (!res.ok) {
  const txt = await res.text();
  return jsonResponse({ error: txt || 'Gemini failed' }, res.status); // ← raw Google JSON in `error`
}
```

---

## What Was Built

### 1. Normalizer — `api/_shared.ts` (new section, +180 lines)

**`parseProviderError(rawText, httpStatus, service)`** — classifies any upstream
failure (JSON / plain text / HTML) into a UI-safe shape:

| Condition | Code | Client status | Friendly message |
|---|---|---|---|
| 429 + "per day" / daily quota metric | `QUOTA_EXCEEDED_DAILY` | 429 | "API quota exceeded — today's AI usage limit has been reached. Resets ~midnight PT." |
| 429 + `retryDelay` (RetryInfo) | `RATE_LIMITED` | 429 | "AI is busy — rate limit reached. Wait ~Ns and try again." (+ `retryAfter` seconds) |
| 429 generic | `RATE_LIMITED` | 429 | "AI is busy right now…" |
| 401/403, `API_KEY_INVALID` | `API_KEY_INVALID` | 500 | Server-config issue wording (no blame on user) |
| 404 / NOT_FOUND | `MODEL_NOT_FOUND` | 502 | Model unavailable |
| Safety/policy blocks | `CONTENT_BLOCKED` | 422 | Rephrase guidance |
| Provider 5xx / HTML pages | `UPSTREAM_ERROR` | 502 | "Provider temporarily unavailable" |

**`providerErrorResponse(rawText, status, service)`** — builds the response envelope
and `console.error`s the full raw payload **server-side only** (visible in Vercel logs).

**`sanitizeThrownError(e, service)`** — for catch blocks: maps raw-JSON `Error.message`
through the normalizer, redacts `?key=` secrets, caps length at 240 chars.

### 2. Envelope (backward compatible)

```json
{
  "error": "AI is busy — the rate limit was reached. Please wait about 30s and try again.",
  "code": "RATE_LIMITED",
  "service": "generate-text",
  "retryAfter": 30,
  "action": "Auto-retry after ~30 seconds is recommended."
}
```

`error` remains a **string**, so every existing client (toasts, chat bubbles) instantly
shows friendly text — no breaking change. The new `code` / `retryAfter` fields are
consumed by the upgraded client in Phase 3.

### 3. Endpoints migrated (4)

- `api/generate-text.ts` — Gemini content pipeline
- `api/seo-tags.ts` — Gemini SEO bundle
- `api/analyze-storyboard.ts` — Gemini storyboard analyzer (also gained body capture; previously dropped it)
- `api/vision-guide.ts` — Gemini vision guides (same)

Both the `!res.ok` provider-error path **and** the outer `catch` path are normalized.

## Audit notes

- `generate-thumbnail.ts`, `generate-storyboard-image.ts`, `transcript.ts`,
  `elevenlabs-tts.ts`, `vectorengine-tts.ts`, `json2video.ts`, `webhook/json2video.ts`
  do **not** pass provider bodies to clients — no change needed.
- Supabase function path already used friendly envelopes; Vercel path now matches.

## Verification

- `npx tsc -p tsconfig.api.json --noEmit` → PASS
- Node smoke suite against real captured Gemini payloads:
  per-minute 429 (RetryInfo) / daily-quota 429 / invalid-key 400 / HTML 500 → 16/16 PASS
- Explicit leak guards: no `RESOURCE_EXHAUSTED`, metric names, provider URLs or HTML
  in any client envelope.

## Deferred (next phases)

- **Phase 2:** model fallback chain (`gemini-2.0-flash` → lite variants), per-minute vs
  daily retry policy, remove server×client double-retry.
- **Phase 3:** client consumes `code`/`retryAfter` (typed `EdgeFunctionError`,
  cooldown-aware retry UI, legacy raw-JSON auto-parse guard).
- **Hygiene:** `.env` committed to public repo (Supabase publishable values), legacy
  duplicate client `src/lib/edgeFunctionClient.ts`.
