# Phase G2 — True White-Labeling & Leak Guard Cleanup

**Commit:** *(this commit)* · **Branch:** `main` (direct push, no PR) · **Date:** 2026-07-18
**Verification:** `npm run verify` → **4/4 gates GREEN, 0 warnings**

---

## 1. Mission

Users must only ever see brand tiers — **Tube.Flash / Tube.Pro / Tube.Cinematic**.
Eliminated every raw backend provider name (Pollinations, SnapGen, FAL, OpenRouter, Gemini)
and every unprofessional phrase ("no API key", "API keys", "Server maps brand to provider")
from user-facing surfaces, then hardened the verify gate so leaks can never silently return.

## 2. Refreshed post-merge inventory → resolution

Scanned the merged tree (incl. PR #9 components `TierAlertBanner`, `ThumbnailCountRadioGroup`,
`useTierAwareApi`, `useTierConfig` → all already clean). 57 edits across 8 files:

| File | Leaks found | Fix |
|---|---|---|
| `src/pages/Thumbnails.tsx` | 9 | Toast, badge, subtitle, tier-card meta, footnote, toggle label, empty state → brand-only copy. **Functional fix:** hardcoded browser-side `image.pollinations.ai` URL replaced with `buildImageUrls({brand, …})` — the static path now honors the selected brand tier through the white-label engine. |
| `src/pages/Storyboard.tsx` | 5 | Removed live `{IMAGE_MODEL_MAP[brand].provider}` JS-rendered leaks (3 spots), tier meta + comment hygiene. |
| `src/pages/SeoOptimizer.tsx` | 6 | "Gemini Edge" toast/badge/subtitle/busy-label/hint → "managed AI engine"; env-var footnote → "Fully managed & server-side". |
| `src/pages/Repurposer.tsx` | 7 | "no API key" scrubbed from page copy **and** from auto-generated LinkedIn/X post templates (they publish to users' social feeds). |
| `src/pages/Privacy.tsx` | 1 | Processor disclosure updated to legally-honest "OpenRouter (Google AI and other leading model providers)" — whitelisted file, legal requirement. |
| `src/pages/AdminPanel.tsx` | 0 (kept) | Admin-only ops doc keeps technical env-var names (matches Vercel dashboard) — whitelisted per approved G2 decision. |
| `src/api/server/imageRouter.ts` | 24 | Client-bundled descriptions, blueprint strings, header/builder comments rewritten brand-only. UI `description.split("—")[0]` still renders "Ultra-fast instant tier" / "Pro-grade tier" / "Cinema-grade premium tier". |
| `src/hooks/useSecureQuery.ts` | 1 | Comment hygiene. |
| `scripts/verify.mjs` | 4 | **Gate 4 promoted to hard FAIL by default** (`--leak-fail` → `--leak-warn` escape hatch). |

## 3. New module — `src/lib/brandCopy.ts`

Single source of truth for tier copy; **accent colors pre-wired for Phase G3**:

| Brand | Tagline | G3 accent |
|---|---|---|
| Tube.Flash | Instant | cyan `#22d3ee` |
| Tube.Pro | Pro-grade | violet `#a78bfa` |
| Tube.Cinematic | Cinema-grade | amber `#fbbf24` |

Exports: `BRAND_TIERS`, `brandTagline()`, `brandBlurb()`, `brandCopy()`, `ENGINE_COPY`
(`managed`, `managedHint`, `brandOnly()`).

## 4. Verification evidence (`node scripts/verify.mjs`)

```
[Gate 1] api/ import extensions ... ✅ 16 api files
[Gate 2] tsc api + app ............ ✅ 0 errors / 0 errors
[Gate 3] vite build ............... ✅ passed
[Gate 4] provider-leak scan ....... ✅ 0 hits (now hard-enforced)
RESULT: 0 failed gate(s), 0 warning(s)
```

Source scans: **zero** `*.provider}` interpolations left in any page; banned-term grep across
`src/pages/*.tsx` returns only the two whitelisted files (AdminPanel, Privacy).

## 5. Intentionally untouched (out of scope)

- Internal code identifiers (`provider:` keys, `snapgen-v1` modelId, live endpoint URLs) —
  functional plumbing, never rendered. Full rename = risky contract refactor.
- Parallel `packages/ai/providers/` system from PR #9 (unfication flagged separately).
- `api/` backend + Supabase legacy path (server-side only, not user-facing).

## 6. Next → Phase G3

Unique premium 3D processing state (`src/components/ui/Processing3D.tsx`, CSS-only cube +
scan beam + progress ring + stage text, per-brand accents from `brandCopy`) replacing
`Thumbnails` (:284/:319) and `Storyboard` (:537/:761) loaders. Awaiting approval.
