# PHASE G1 — TypeScript/Vercel Error Eradication (Verification Gates) — REPORT

**Date:** 2026-07-17
**Status:** ✅ COMPLETED
**Rollback point:** git tag `pre-phase-g`

---

## Finding up front

`main` was already **fully green**: 0 errors in `tsconfig.api.json`, 0 in
`tsconfig.app.json`, all 13 `api/*.ts` files carry `.js` import extensions
(TS2835 solved in earlier phases), and `retryAfter` types are consistent across
`_shared.ts → EdgeFunctionError → friendlyError`. **No fix was needed — so G1
builds the guardrail that keeps it this way.**

## What was built

### `scripts/verify.mjs` + npm scripts — pre-push verification gates

  Gate 1  api/*.ts: every relative import must carry `.js` (TS2835 regression guard)
  Gate 2  `tsc --noEmit` on BOTH tsconfig.api.json and tsconfig.app.json
  Gate 3  `vite build` (skippable via `--skip-build`)
  Gate 4  provider-leak scan: banned terms (pollinations|snapgen|fal.ai|openrouter|
          gemini|deno|…) inside user-visible .tsx string literals
          → WARN mode now; **`--leak-fail` promotes to hard FAIL after Phase G2**

New npm scripts: `npm run typecheck`, `npm run verify`.
Whitelist registry: `scripts/verify-whitelist.txt` (currently empty).

### Proof run (this commit's validation)

    Gate 1 ✅ 13 api files, all imports carry .js
    Gate 2 ✅ tsconfig.api.json 0 errors  ✅ tsconfig.app.json 0 errors
    Gate 3 ✅ vite build passed
    Gate 4 ⚠️ 4 leak hits (WARN) — handed to Phase G2 as actionable targets

### Bonus find — queued for Phase G2

Gate 4 exposed that the Thumbnail "static" path builds
`https://image.pollinations.ai/prompt/…` URLs **directly in the browser**
(`src/pages/Thumbnails.tsx:123`) and Repurposer surfaces "no API key" copy in
page text AND in the auto-generated LinkedIn post template. Both exceed
"rename strings" scope: G2 will route the static path through the server-side
brand engine and strip infra copy from generated posts.

## Decision recorded

`tsc` was intentionally NOT wired into `vite build`'s script — Vercel builds are
time-boxed; verify stays an on-demand/pre-push gate (approved in plan).
