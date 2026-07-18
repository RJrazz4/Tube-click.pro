# PHASE 5 — Web UI Integration (Storyboard + Thumbnail) — REPORT

**Date:** 2026-07-18
**Status:** ✅ COMPLETED
**Branch:** `arena/019f71c7-tube-click-pro`

---

## Objective

Connect the Phase 4 API layer to the frontend UI. Add tier-aware components (alert banners, radio group selectors) and shared hooks that consume the new `/api/v1/` endpoints. Provide E2E test specs for validation.

---

## What Was Built

### Step 5.3 — Shared Hooks (`src/hooks/`)

**`useTierConfig`** (`src/hooks/useTierConfig.ts`):
- Reads the user's tier from the Zustand app store (`useAppStore`)
- Normalises "free" → `free`, "pro"/"enterprise" → `premium` for shared config lookups
- Derives all feature limits: `maxScenes`, `maxThumbnails`, `allowedBrands`, `hasWatermark`
- Provides `exceedsSceneLimit()`, `clampValue()` helpers
- Memoised via `useMemo` — only re-computes when tier changes
- Integration-ready: `upgradeMessage` for UI display

**`useTierAwareApi`** (`src/hooks/useTierAwareApi.ts`):
- `useStoryboardGeneration()` — React Query mutation for `POST /v1/storyboard`
  - Automatically injects tier, clamps brand to allowed set
  - Surfaces `truncated` and `upgrade_message` from the server response
- `useThumbnailGenerationV1()` — React Query mutation for `POST /v1/thumbnail`
  - Clamps count via tier config, downgrades brand if needed
  - Shows toast warnings when limits are enforced
- `QK_V1` — Additional query keys for Phase 4 endpoint caching
- Full TypeScript types for request/response shapes (`StoryboardResponseData`, `ThumbnailResponseData`)

**`src/hooks/index.ts`** — Barrel export for all hooks

**`src/api/client/secureClient.ts`** — Updated `VERCEL_ROUTE_MAP` with `v1/storyboard` and `v1/thumbnail`

### Step 5.1 — Storyboard Tier Alert Banner

**`src/components/storyboard/TierAlertBanner.tsx`:**

Three variants rendered based on the user's current state:

| Variant | Appearance | Content |
|---------|-----------|---------|
| `free` | Subtle primary gradient, blue/purple | "Free Plan" with usage meter (`3 of 4 scenes used`), Upgrade CTA button, progress bar |
| `free` (near limit) | Amber gradient | "Free Plan — near limit" with amber warning, remaining count highlighted |
| `limit` | Red/danger gradient | "Scene limit reached (4)" with AlertTriangle icon, Upgrade button |
| `premium` | Amber/purple gradient | "Premium Plan Active" with Crown icon, Premium badge, no CTA needed |

Features:
- Animated usage progress bar (scales from 0-100%)
- `isNearLimit` detection when scenes are at `max - 1`
- Upgrade button calls `onUpgrade` callback (plumbed to toast for now, ready for Stripe integration)
- Responsive design, works on mobile

**Integration into `src/pages/Storyboard.tsx`:**
- Imported `useTierConfig` and `TierAlertBanner`
- Rendered at the top of the page, above the script/scenes grid
- `bannerVariant` computed via `useMemo` based on `isPremium`, `scenes.length`, and `maxScenes`
- Dynamically re-renders as scenes are added/removed

### Step 5.2 — Thumbnail Count Radio Group

**`src/components/thumbnail/ThumbnailCountRadioGroup.tsx`:**

- Tier-aware radio group using shadcn/ui `RadioGroup` component
- Free users: options 1, 2 (max thumbnails per `useTierConfig`)
- Premium users: options 1, 2, 3, 4
- Selected count reflected in the generate button ("Generate 2 via Tube.Pro")
- Resets thumbnail states when count changes
- Clear label with tier badge: "Free: max 2"

**Integration into `src/pages/Thumbnails.tsx`:**
- Added `thumbnailCount` state (default 4)
- `ThumbnailCountRadioGroup` rendered in the Settings card, after aspect ratio
- Generate function uses `thumbnailCount` instead of hardcoded `4`
- All progress indicators, success toasts, and grid rendering dynamically sized to count
- Fallback (non-AI) path generates `thumbnailCount` variations dynamically
- All hardcoded `4` references replaced with `thumbnailCount`:
  - Initial states array: `generating + (N-1) pending`
  - Progress: `(i + 1) / thumbnailCount * 100`
  - Toast messages: "All N thumbnails generated"
  - Generate button: "Generate N via {brand}"
  - Status display: "X/N complete"

### E2E Specs (`e2e/`)

| File | Coverage |
|------|----------|
| `e2e/playwright.config.ts` | Playwright config — Chrome, 1280x720, dev server auto-start |
| `e2e/specs/storyboard-tier-banner.spec.ts` | 5 tests: banner visibility, usage text, upgrade CTA, progress bar, limit scenario |
| `e2e/specs/thumbnail-count-radio.spec.ts` | 4 tests: option rendering, selection, button text update, slot count |
| `e2e/specs/api-tier-enforcement.spec.ts` | 5 tests: free truncation (10→4), premium unlimited, thumbnail clamp, brand downgrade, validation |

**API enforcement tests cover:**
- Free tier: 10 scenes → truncated to 4, `truncated: true`, upgrade message present
- Premium tier: 8 scenes → kept, `truncated: false`
- Free tier thumbnails: count 4 → clamped to 2, brand "Tube.Cinematic" → downgraded to "Tube.Flash"
- Premium thumbnails: count 4 → kept, brand preserved
- Validation: empty body → 400 with field errors

---

## File Changes

**New files (9):**

| File | Purpose |
|------|---------|
| `src/hooks/useTierConfig.ts` | Reactive tier config hook |
| `src/hooks/useTierAwareApi.ts` | Tier-aware API hooks (storyboard + thumbnail) |
| `src/hooks/index.ts` | Hooks barrel export |
| `src/components/storyboard/TierAlertBanner.tsx` | Tier alert banner (3 variants) |
| `src/components/thumbnail/ThumbnailCountRadioGroup.tsx` | Thumbnail count radio group |
| `e2e/playwright.config.ts` | E2E test configuration |
| `e2e/specs/storyboard-tier-banner.spec.ts` | Storyboard banner E2E tests (5) |
| `e2e/specs/thumbnail-count-radio.spec.ts` | Thumbnail count E2E tests (4) |
| `e2e/specs/api-tier-enforcement.spec.ts` | API tier enforcement E2E tests (5) |

**Modified files (3):**

| File | Change |
|------|--------|
| `src/pages/Storyboard.tsx` | Added TierAlertBanner + useTierConfig hook |
| `src/pages/Thumbnails.tsx` | Added ThumbnailCountRadioGroup + thumbnailCount state; all hardcoded `4` → dynamic `thumbnailCount` |
| `src/api/client/secureClient.ts` | Added `v1/storyboard` and `v1/thumbnail` to VERCEL_ROUTE_MAP |

---

## Data Flow

```
User clicks "Analyze" / "Generate"
  → useTierConfig() reads tier from Zustand store
  → Hook auto-injects { tier, brand (clamped), count (clamped) }
  → POST /api/v1/storyboard or /api/v1/thumbnail
  → Server enforces limits, truncates/downgrades, returns { truncated, upgrade_message }
  → Hook surfaces upgrade toast (if truncated)
  → UI re-renders with tier banner reflecting current state
  → TierAlertBanner shows usage bar / limit alert / premium badge
```

---

## Next — Phase 6

**Phase 6: Hardening, Observability & Docs**
- Structured logging (Vercel Edge with Logtail / Axiom)
- Metrics endpoint (generation count, latency percentiles, fallback rate)
- API documentation (OpenAPI 3.0 spec)
- Production readiness checklist

Ready for approval to proceed to Phase 6.
