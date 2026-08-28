# Active Runtime Surface

This document defines the supported, shipped surface area of TubeClick Pro. Everything listed here is live in production and has an owner (a user journey, an API contract, tests). Anything not listed is a candidate for removal in a future cleanup pass.

Use this document as the guardrail when adding or removing features.

---

## 1. Client (`src/`)

### Shipped Routes

| Route | Purpose |
|---|---|
| `/` | Dashboard — competitive intelligence overview and key actions |
| `/clone-crush` | Analyze & Create — competitor channel analysis and content package generation |
| `/create` | Create from a topic — TubeBot topic-based content generation |
| `/chat` | Backward-compatible alias for Create from a topic |
| `/seo` | SEO Optimizer — titles, descriptions, tag packs |
| `/voice` | Voiceover Studio — script-to-speech with preview caching |
| `/repurposer` | Content Repurposer — transcript-based asset generation |
| `/library` | Local Library — saved content search, filters, and exports |
| `/rewards` | Referral program dashboard and share toolkit |
| `/settings` | Account, subscription, and API configuration |
| `/about` | Product information |
| `/ref/*` | Referral capture endpoint |

### Core Client Modules

- **`src/api/client/secureClient.ts`** — single outbound HTTP client; applies auth, timeout, and retry policy; routes to Vercel Edge when `VITE_USE_VERCEL_EDGE=true`.
- **`src/api/client/queryKeys.ts`** — React Query key namespace.
- **`src/integrations/supabase/`** — Supabase client, auth listeners, session helpers.
- **`src/lib/auth/`**, **`src/lib/referrals/`**, **`src/lib/domain/`** — domain logic.
- **`src/hooks/`** — typed data hooks (`useSecureQuery`, lazy loading, voice preview, canonical meta).
- **`src/components/ui/`** — shadcn/ui primitives plus project-specific presentation components.
- **`src/components/*`** — feature components (auth, intelligence, lab, layout, performance, referrals, showdown, sponsors, workflow).
- **`src/stores/`** — Zustand stores.

## 2. Server (`api/` — Vercel Functions)

All functions under `api/` are auto-deployed by Vercel. Versioned endpoints live under `api/v1/`.

| Endpoint | Runtime | Owner flow |
|---|---|---|
| `GET /api/config` | edge | Public config, feature flags, tier copy |
| `POST /api/guest-access` | edge | Soft-gate cookie |
| `POST /api/referrals` | edge | Referral attribution and rewards |
| `POST /api/clone-crush` | edge | Clone & Crush analysis and asset generation |
| `POST /api/seo-tags` | edge | SEO pack generation |
| `POST /api/generate-text` | edge | TubeBot chat (delegates to `api/_ai.ts`) |
| `POST /api/analyze-storyboard` | edge | Scene extraction from script |
| `POST /api/elevenlabs-tts` | edge | Voiceover generation |
| `GET  /api/transcript` | node | YouTube transcript retrieval |
| `POST /api/v1/storyboard` | edge | Versioned storyboard generation |
| `POST /api/v1/thumbnail` | edge | Versioned thumbnail generation |
| `GET  /api/v1/tiers` | edge | Authoritative tier catalog |
| `GET  /api/v1/metrics` | edge | In-memory observability snapshot |

Internal helpers (`api/_ai.ts`, `api/_shared.ts`) are not public endpoints.

## 3. Internal Packages (`packages/`)

| Package | Status |
|---|---|
| `packages/orchestrator/` | **Active.** Core AI orchestration (manager, promptsmith, providers, keys, resilience, cost, observability, route handlers). The `api/v1/*` functions delegate here. |
| `packages/shared/` | **Active.** Cross-package environment parsing and shared types. |
| `packages/ai/` | **Compatibility.** Legacy lightweight AI client retained for parity with older routes. New code should use `packages/orchestrator`. |

## 4. Ancillary Surfaces (Retained, Not Primary Path)

- **`apps/api/`** — Reference router implementation used for contract parity testing; not wired into Vercel routing.
- **`supabase/functions/`** — Supabase Edge Function blueprints. The primary production path is Vercel; these are retained for dual-routing fallback.
- **`supabase/migrations/`** — **Active.** Source of truth for the Postgres schema.
- **`scripts/`** — Tooling (`verify.mjs`, v1 contract test). Not shipped.
- **`tests/`**, **`e2e/`** — Vitest and Playwright test suites.

## 5. Removed / Retired (historical)

The following classes of code were removed in prior cleanup passes and must not be reintroduced without a vertical slice that justifies them end to end:

- Unrouted standalone storyboard, thumbnail, and vision UI modules
- Client-only orchestration view models and V1 payload adapters that duplicated server logic
- JSON2Video client/server/webhook prototype
- Duplicate TTS wrappers
- Next.js App Router blueprints (the application is a Vite SPA)

## 6. Rule for New Capabilities

Any new capability must land as a complete vertical slice:

1. **Product surface** — a route or clearly scoped UI entry point.
2. **Server endpoint** — a versioned or named function under `api/` with server-side authorization.
3. **Typed client contract** — a Zod schema shared between server and client, plus a React Query hook.
4. **Orchestrator integration** — provider adapters, resilience, and tier enforcement live in `packages/orchestrator`, not in the route file.
5. **Error states and fallbacks** — the user never sees a raw "Failed to fetch" or red error.
6. **Tests** — unit tests for the handler, plus at least one Playwright assertion for the happy path.
7. **Documentation** — update `docs/openapi.yaml` and this document.

If a proposed addition cannot meet the vertical-slice bar, it belongs on a branch with an owner and a tracking issue — not on `main`.
