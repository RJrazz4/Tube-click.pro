# PHASE E4 — Verification, Type Safety & Hygiene — REPORT

**Date:** 2026-07-17
**Status:** ✅ COMPLETED
**Gates:** `tsc` app **0 errors** (was 10 pre-existing) · `tsc` api PASS · `vite build` PASS (5.9s) · end-to-end 429 simulation **16/16 PASS**
**Depends on:** E1 (5dc703c), E2 (73e023e), E3 (4c7fca4)

---

## 1. End-to-end 429 simulation (integration test)

Real `api/generate-text` handler code + real `secureClient` code bundled and run under
Node 20 with `fetch` mocked to return **captured Gemini payloads**:

**Scenario A — full quota outage (flash + lite daily-429 JSON):**
- Handler fails over flash → lite, returns 429 with `{ code: "QUOTA_EXCEEDED_DAILY" }`
- Envelope contains **zero** provider internals (`RESOURCE_EXHAUSTED`, metric names, API key — all absent)
- Real client throws typed `EdgeFunctionError{code, status:429}` after **exactly 1 request** (no retry storm)
- `friendlyError()` renders: *"Daily AI quota reached — …resets around midnight PT"*

**Scenario B — primary dead, quota failover succeeds:**
- 200 via `gemini-2.0-flash-lite`, response includes `model` + `modelFailover` transparency
- Content payload intact; no error keys leaked

## 2. Pre-existing type errors fixed (10 → 0)

| File | Error | Fix |
|---|---|---|
| `src/pages/Storyboard.tsx` | TS2552 `Cannot find name 'url'` — was a real JSX bug (`{url}` inside JSX text evaluated as expression) | escaped to `{"{url}"}` |
| `src/pages/Repurposer.tsx` (×5) | `wordCount`/`length`/`source` missing from transcript type | widened generic in `useSecureQuery.ts` `useTranscriptExtraction` |
| `src/api/server/imageRouter.ts` (×4) | `Deno` unknown under app tsconfig (cross-runtime guarded at runtime) | minimal `declare const Deno: any` ambient |

## 3. Hygiene

- **`.env` untracked** (`git rm --cached`) — it was committed to a *public* repo before the
  `.gitignore` rule existed. Local file retained; `.gitignore:16` verified active.
  ⚠️ *Note: values remain in git history. They are Supabase "publishable" tier (designed to
  be public, RLS-protected), but if you ever commit a real secret, rotate it and scrub history.*
- **Deleted `src/lib/edgeFunctionClient.ts`** — dead duplicate client (0 importers; superseded by `src/api/client/secureClient.ts`).

## Final state of the quota-error pipeline

```
Gemini 429 (raw 2KB JSON)
  → fetchGeminiWithRetry: daily? instant failover to flash-lite (env chain)
  → all models dead? parseProviderError → {error, code, retryAfter?, action}
  → secureClient: typed EdgeFunctionError (1 request, no double-retry)
  → friendlyError() / ErrorInlineCard / toastFriendlyError()
  → UI: "Daily AI quota reached — resets ~midnight PT" + cooldown-aware "Try again"
```
