# PHASE 4 — Business Logic & API Layer — REPORT

**Date:** 2026-07-18
**Status:** ✅ COMPLETED
**Branch:** `feat/phase-3-generator` (Phase 3 + Phase 4)

---

## Objective

Build a structured business logic and API layer on top of the Phase 3 Generator Agent. Enforce subscription tier limits, provide validated REST endpoints, and shape responses with provider provenance.

---

## What Was Built

### Step 4.1 — Tier Config (`packages/shared/tier.ts`) ✅ *Already created in Phase 3*

| Limit | Free | Premium |
|-------|------|---------|
| Max scenes | 4 | ∞ |
| Max thumbnails | 2 | 4 |
| Allowed brands | Tube.Flash | All (Flash, Pro, Cinematic) |
| Allowed providers | pollinations | pollinations, agnes-flash, gemini-flash |
| JSON2Video quality | draft | high |
| Watermark | yes | no |

Complete with `getTierLimits()`, `exceedsSceneLimit()`, `clampByTier()` helpers.

### Step 4.2 — API Routes (`apps/api/src/routes/`)

**Route Structure:**

```
apps/api/src/routes/
  index.ts                         # Router — maps paths to handlers
  shared.ts                        # CORS, JSON response helpers, error types
  validation/
    storyboard.ts                  # Zod schema for storyboard requests
    thumbnail.ts                   # Zod schema for thumbnail requests
  middleware/
    tier.ts                        # Tier enforcement (truncation, brand downgrade)
  v1/
    storyboard.ts                  # POST /v1/storyboard handler
    thumbnail.ts                   # POST /v1/thumbnail handler
```

**Vercel Edge Function Entry Points:**

```
api/v1/storyboard.ts               → /api/v1/storyboard
api/v1/thumbnail.ts                → /api/v1/thumbnail
```

**`POST /api/v1/storyboard` — Request/Response Contract:**

Request:
```json
{
  "topic": "10 React Tips",
  "scenes": [{ "scene_number": 1, "visual_prompt": "...", "duration": 5, "transition": "fade" }],
  "tier": "free",
  "brand": "Tube.Flash",
  "aspect_ratio": "16:9",
  "seed": 12345
}
```

Response:
```json
{
  "success": true,
  "data": {
    "topic": "10 React Tips",
    "tier": "free",
    "brand": "Tube.Flash",
    "scenes": [{ "scene_number": 1, "image_url": "...", "provider": "pollinations", "duration": 5 }],
    "total_scenes": 1,
    "requested_scenes": 5,
    "truncated": true,
    "upgrade_message": "Free plan limited to 4 scenes...",
    "limits": { "max_scenes": 4, "allowed_brands": ["Tube.Flash"] }
  }
}
```

**`POST /api/v1/thumbnail` — Request/Response Contract:**

Request:
```json
{
  "title": "Best AI Tools 2026",
  "emotion": "Exciting",
  "style": "Modern",
  "aspect_ratio": "16:9",
  "count": 4,
  "tier": "free",
  "brand": "Tube.Pro"
}
```

Response (with tier enforcement — brand downgraded, count clamped):
```json
{
  "success": true,
  "data": {
    "title": "Best AI Tools 2026",
    "tier": "free",
    "brand": "Tube.Flash",
    "thumbnails": [{ "index": 1, "url": "...", "provider": "pollinations" }],
    "total_generated": 1,
    "requested": 4,
    "truncated": true,
    "degraded": false
  }
}
```

### Step 4.3 — Request Validation & Response Shaping

**Zod Schemas** (`validation/storyboard.ts`, `validation/thumbnail.ts`):
- Full runtime validation with typed inferrence
- Field-level error messages returned as `{ field, message }[]`
- Default values for optional fields (duration, transition, beat_type, etc.)

**Tier Middleware** (`middleware/tier.ts`):
- `enforceStoryboardTier()` — checks scene count + brand; truncates/downgrades
- `enforceThumbnailTier()` — clamps count + brand; returns upgrade prompt
- `tierFromRequest()` — resolves tier from body / header / server override
- Never rejects — always downgrades gracefully with `upgradeMessage`

**Response Shaping** (`shared.ts`):
- Standardised `ok()`, `badRequest()`, `paymentRequired()`, `tooManyRequests()`, `serverError()`
- Consistent envelope: `{ success, data }` or `{ success: false, error, code }`
- Provider provenance per-image: `{ url, provider, from_fallback, info }`
- `truncated` flag + `upgrade_message` when tier limits bite

### Integration with Phase 3

The route handlers construct the `GeneratorOrchestrator` with lazy singleton pattern:
1. Attempt `AgnesFlashAdapter` (if env configured)
2. Attempt `GeminiFlashAdapter` (if env configured)
3. `PollinationsAdapter` as ultimate fallback (always available)
4. Each scene/thumbnail generation is a parallel batch via `orchestrator.generate()`

### Security

- No API keys in response payloads — provider names are safe identifiers
- Tier enforcement is server-side (client `tier` field is trusted for dev; production would use JWT/session)
- All input validated via Zod before any processing
- Standard CORS headers consistent with existing `api/_shared.ts`

---

## File Changes

**New files (10):**

| File | Purpose |
|------|---------|
| `apps/api/src/routes/index.ts` | Universal router — maps paths to handlers |
| `apps/api/src/routes/shared.ts` | Response helpers (ok, badRequest, serverError, etc.) |
| `apps/api/src/routes/validation/storyboard.ts` | Zod schema + validation for storyboard |
| `apps/api/src/routes/validation/thumbnail.ts` | Zod schema + validation for thumbnail |
| `apps/api/src/routes/middleware/tier.ts` | Tier enforcement middleware |
| `apps/api/src/routes/v1/storyboard.ts` | POST /v1/storyboard handler |
| `apps/api/src/routes/v1/thumbnail.ts` | POST /v1/thumbnail handler |
| `api/v1/storyboard.ts` | Vercel Edge entry point → /api/v1/storyboard |
| `api/v1/thumbnail.ts` | Vercel Edge entry point → /api/v1/thumbnail |
| `PHASE_4_REPORT.md` | This file |

---

## Next — Phase 5

**Phase 5: Web UI Integration (Storyboard + Thumbnail)**
- Storyboard Generator Page with Free/Premium alert banners
- Thumbnail Generator Page (Radio group: 1 or 2 thumbnails)
- Shared hooks and E2E specs

Ready for approval to proceed to Phase 5.
