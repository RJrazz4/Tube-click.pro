# PHASE E3 — Frontend Error UX Elegance — REPORT

**Date:** 2026-07-17
**Status:** ✅ COMPLETED
**Typecheck:** `tsconfig.app.json` — ZERO new errors (verified against HEAD baseline via git-stash diff: the 10 remaining errors are pre-existing — `imageRouter.ts` Deno globals, `Repurposer` transcript type, `Storyboard` `url` typo)
**Behavior tests:** 12/12 PASS + fuzz leak-guards
**Depends on:** Phase E1 (envelopes), Phase E2 (typed retry meta)

---

## Objective

Raw provider JSON must never appear in the UI again — even from legacy/cached
error strings — and quota errors should look like designed product states, with a
safe retry path.

## What Was Built

### 1. `src/lib/friendlyError.ts` (new, dependency-free)

`friendlyError(err, fallback?) → { code, title, message, retryAfter?, action? }`

Layered classification:
1. **Typed envelope** (Phase E1/E2 `code`/`retryAfter`/`action`) → trusted, server message kept
2. **Legacy raw JSON** (the original bug shape) → parsed + classified (daily vs per-minute
   429, invalid key, content block, model missing…) and replaced with friendly copy
3. **Transport** (`Failed to fetch` → NETWORK, AbortError → TIMEOUT)
4. **Clean legacy strings** pass through — but markup and JSON fragments are
   explicitly rejected after fuzz-testing caught `<html>nginx 502</html>` slipping through

Code → copy table: `QUOTA_EXCEEDED_DAILY` ("Daily AI quota reached… resets ~midnight PT"),
`RATE_LIMITED` ("AI is busy…"), `API_KEY_INVALID`, `MODEL_NOT_FOUND`, `CONTENT_BLOCKED`,
`UPSTREAM_ERROR`, `NETWORK`, `TIMEOUT`, `INTERNAL`, `AUTH`, `UNKNOWN`.

### 2. `src/lib/errorToast.ts` (new)

`toastFriendlyError(err, fallback?)` — one-liner sonner toast with title + description
(+ `≈Ns` when the provider handed us a retry delay).

### 3. `EdgeFunctionError` becomes typed — `src/api/client/secureClient.ts`

`code`, `retryAfter`, `action` now extracted from the server envelope at every throw
site (JSON + blob paths) via shared `errorMeta()`. Components no longer guess from strings.

### 4. `ChatAgent.tsx` — the error card (replaces `❌ Error: {raw json}` chat bubbles)

- `Message.error?: FriendlyError` — bubbles render an **`ErrorInlineCard`**: warning icon,
  headline, friendly message, optional action hint — no stack of JSON.
- **Retry with cooldown**: for `RATE_LIMITED`/`UPSTREAM_ERROR`/`NETWORK`/`TIMEOUT`, a
  "Try again" button; on provider-hinted limits it shows `Retry in Ns` with a live
  1-second countdown, then re-submits the stored `lastRequest` (`overrideTopic` param,
  no form-event hack).
- Toasts upgraded to title + description.

### 5. Pages migrated to friendly errors (single-line diffs)

| Page | Before (raw) | After |
|---|---|---|
| Repurposer | `toast.error(msg)` — raw JSON toast | `toastFriendlyError` |
| SeoOptimizer | misleading hardcoded "Wait 30s" on daily quota | `toastFriendlyError` |
| Thumbnails | raw `error.message` in toast **and** in thumbnail state UI | mapped `friendly.message` both places |
| VisionGuide | guesses via status int | typed 401/403 → session note; else `toastFriendlyError` |
| Storyboard | same stale key messaging | same pattern as VisionGuide |
| VoiceStudio | raw `error.message` toast | `toastFriendlyError` |

Pre-existing type errors on untouched lines left as-found (noted in typecheck summary);
`src/pages/Storyboard.tsx`'s inner per-scene image retry was reviewed and is safe
(image API never passed provider bodies).

## Verification

- `tsc -p tsconfig.app.json`: error set **identical to HEAD baseline** (only shifted line numbers)
- 12/12 mapper tests: legacy JSON, typed envelopes, transport, fallbacks
- Fuzz guard: 6 adversarial samples (429 JSON ×2, key-invalid JSON, HTML 502, JSON
  fragment, empty) — none leak provider internals into `message`
- Regression: clean legacy strings still pass through

## Remaining hygiene (Phase 4 candidates)

- `.env` committed to public repo (Supabase publishable values)
- Dead duplicate: `src/lib/edgeFunctionClient.ts` (verify zero imports, then remove)
- Pre-existing type errors listed above (Deno globals config, Repurposer type, Storyboard `url`)
