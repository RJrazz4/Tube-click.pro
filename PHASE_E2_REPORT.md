# PHASE E2 — Resilience: Model Fallback + Policy-Driven Retry — REPORT

**Date:** 2026-07-17
**Status:** ✅ COMPLETED
**Typecheck:** `tsc -p tsconfig.api.json` PASS · `tsconfig.app.json` — 0 errors in touched files
**Behavior tests:** 18/18 PASS (mocked Gemini traffic scenarios)
**Depends on:** Phase E1 (5dc703c) — error normalization

---

## Objective

When Gemini quota is exhausted, users should get served by a fallback model instead
of burning ~35s on stacked server+client retries that can never succeed. Design insight:
**Google daily quotas are per-model-per-day** and per-minute limits carry an explicit
`retryDelay` — so retry policy must differ by quota TYPE.

## What Was Built

### 1. `fetchGeminiWithRetry()` rewrite — `api/_shared.ts`

New return type `GeminiFetchOutcome { res, model, attempted, failedOver }`.

| Upstream result | Old behavior | New policy |
|---|---|---|
| `QUOTA_EXCEEDED_DAILY` (per-day quota) | retry same model after 2s/5s/10s — hopeless | **instant failover** to next model (no sleep) |
| `RATE_LIMITED` + `retryDelay: Ns` | blind fixed backoff | honor Google's hint **once per model**, capped at 15s/sleep and a global `GEMINI_RETRY_BUDGET_MS` (default 12s) to stay inside Vercel edge maxDuration; then failover |
| `RATE_LIMITED` w/o hint | - | failover to next model (no guessing) |
| Non-429 4xx (bad req / key) | returned immediately | same — no cross-model failover (identical everywhere) |
| 5xx `UPSTREAM_ERROR` | retry after fixed delays | one 2s backoff retry, then failover |

Response bodies are only read via `res.clone()` — callers still stream the final
error body verbatim into the Phase 1 normalizer.

### 2. Env-overridable model chain

- `GEMINI_MODEL` (default `gemini-2.0-flash`)
- `GEMINI_MODEL_FALLBACKS` CSV (default `gemini-2.0-flash-lite`)
- `GEMINI_RETRY_BUDGET_MS` (default `12000`)
- `geminiModelChain()` dedupes + preserves order. Longer chains possible: e.g. `gemini-2.0-flash,gemini-2.0-flash-lite,gemini-2.5-flash`.

### 3. Response transparency (all 4 Gemini handlers)

Success payloads now include `model` and, on failover, `modelFailover: [models tried]`.
Lets the UI (Phase 3) and analytics see when degradation happened.

### 4. Client de-stacking — `src/api/client/secureClient.ts`

Old: server retried 429 (≈17s in-function) **and** client retried again (≈17s),
~35s dead wait on a daily quota that cannot recover.

New: if the server speaks the Phase E1 envelope (`code` present) the client trusts
its verdict and fails fast; the ONLY exception is honoring an explicit provider
`retryAfter` hint — once, capped at 30s, jitter is non-negative (a hinted delay is a
floor, not a target). Legacy Supabase path (no `code`) keeps its old bounded retry.

## Verification (18 scenarios, all mocked)

- Daily 429 → failover in <700ms total, no sleep ✅
- RPM 429 (2s hint) → one honored retry (~2s), then failover ✅
- RPM 429 (45s hint) → hint refused at edge, instant failover ✅
- All models daily-429 → exactly 2 fetches, body intact for the normalizer ✅
- 400 invalid key → 1 fetch, zero wasted calls ✅
- 500 → 2s backoff, recovery on same model ✅
- Chain env override / dedupe ✅

## Ops notes

- Set in Vercel if desired: `GEMINI_MODEL`, `GEMINI_MODEL_FALLBACKS`,
  `GEMINI_RETRY_BUDGET_MS`. Defaults work with zero config.
- Vercel logs now show upstream detail (`[service] upstream HTTP 429 → CODE`) while
  clients receive only the friendly envelope.

## Deferred

- **Phase 3 (frontend UX):** typed `EdgeFunctionError.code`/`retryAfter`,
  `friendlyError()` mapper, cooldown-aware retry UI, legacy raw-JSON render guard.
- **Hygiene:** `.env` in public repo; legacy duplicate `src/lib/edgeFunctionClient.ts`.
