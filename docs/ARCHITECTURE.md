# Architecture

This document is the canonical reference for how TubeClick Pro is put together. It is written for engineers joining the project, reviewers performing technical diligence, and future maintainers.

---

## 1. High-level Shape

TubeClick Pro is a three-tier system:

1. **Presentation tier** — a single-page React application (Vite + TypeScript + Tailwind + shadcn/ui/Radix) served as static assets from Vercel's edge CDN.
2. **API tier** — Vercel Edge and Node.js serverless functions living under the repository root `api/` directory. Every third-party integration (LLM providers, YouTube, TTS, payment verification) is mediated here.
3. **Data tier** — Supabase (managed Postgres) for accounts, referral chains, and entitlements; authenticated via Supabase Auth and secured with Row-Level Security.

Cross-cutting concerns (caching, telemetry, tier enforcement, multi-key rotation, resilience) live in `packages/orchestrator`, a versioned internal package shared by all API functions.

## 2. Architectural Principles

1. **Server-side trust boundary.** The browser is an untrusted client. Every decision that affects spend, quota, or entitlement is re-verified on the server. Client-side "Pro" indicators are optimistic UI only.
2. **Secrets never leave the server.** No AI-provider API key, YouTube API key, locker secret, or service credential is injected into the Vite bundle. The `VITE_` prefix is reserved exclusively for non-secret public configuration (Supabase URL, anon key, app URL).
3. **Provider-agnostic orchestration.** The application does not couple to a single LLM or image vendor. `packages/orchestrator/providers` defines a small `Provider` interface; concrete adapters exist for OpenRouter, Gemini Flash, Pollinations, HuggingFace Inference, Replicate, Together, and Agnes. Selection policy (free vs. premium, failover order, quality thresholds) lives in `packages/orchestrator/manager`.
4. **Graceful degradation over hard failure.** End-user tool calls never surface raw provider errors. The orchestrator retries across keys and models, then falls back through deterministic/synthetic responses, so long-running workflows (storyboards, thumbnails) degrade in quality rather than abort.
5. **Cost-aware routing.** Each provider reports cost tier; the manager constrains premium-provider usage per user tier and records per-call cost metrics in memory (exposed through `/api/v1/metrics`).
6. **Type-safety end to end.** Zod schemas validate every inbound request at the edge; TypeScript `strict` is on for all packages; Vitest unit tests cover hot paths (key pool, circuit breaker, promptsmith, manager, routing).
7. **Observability built in.** Structured, key-material-free logs, in-memory counters, and health snapshots are exposed at `/api/v1/metrics`. Provider circuit-breaker state is queryable for on-call diagnosis.

## 3. Frontend

- **Build:** Vite 5 with the React SWC plugin. Code splits by route; heavy tool pages (Clone & Crush, Storyboard, Voiceover) are lazy-loaded to keep first paint under budget.
- **Routing:** `react-router-dom` v6 with a single `MainLayout` shell (sidebar + top bar + footer) and authenticated routes gated by `SoftGateRoute`.
- **Data layer:** `@tanstack/react-query` v5 for server state (stale-while-revalidate, retries with backoff, query-key namespace). `zustand` v5 for client UI state (modals, licensing, license snapshot, referral progress).
- **Styling:** Tailwind CSS with a curated design system; shadcn/ui primitives wrap Radix; custom glass/neon accents live in `src/index.css`.
- **Auth:** Supabase Auth (email OAuth + social). Sessions are persisted in Supabase's cookie storage; referral attribution uses an HMAC-signed HttpOnly cookie set by `/api/referrals`.
- **Error boundary:** `AppErrorBoundary` at the root catches render errors and surfaces a user-friendly fallback rather than a white screen.

## 4. API Tier

Root `api/` files are auto-deployed by Vercel based on filename. Functions either run on the Edge runtime (sub-50ms cold start, global distribution) or Node.js runtime where dependencies require it (e.g. `youtube-transcript`).

| Endpoint | Runtime | Purpose |
|---|---|---|
| `GET /api/config` | edge | Public configuration (feature flags, tier copy, locker URL) |
| `POST /api/guest-access` | edge | PLG soft-gate cookie issuance |
| `POST /api/referrals` | edge | Referral attribution, reward RPC, share-link signing |
| `POST /api/clone-crush` | edge | Competitor analysis + asset generation |
| `POST /api/seo-tags` | edge | SEO title/description/tag pack generation |
| `POST /api/generate-text` | edge | TubeBot chat (delegates to `api/_ai.ts`) |
| `POST /api/analyze-storyboard` | edge | Scene extraction from scripts |
| `POST /api/elevenlabs-tts` | edge | Voice generation with server-side key |
| `GET /api/transcript` | node | YouTube transcript retrieval with fallbacks |
| `POST /api/v1/storyboard` | edge | Versioned storyboard generation |
| `POST /api/v1/thumbnail` | edge | Versioned thumbnail generation |
| `GET /api/v1/tiers` | edge | Authoritative tier catalog |
| `GET /api/v1/metrics` | edge | In-memory observability snapshot |

Versioned (`/api/v1/*`) routes are thin TypeScript entry points that delegate to `packages/orchestrator/api/*` handlers — keeping routing, validation, and business logic unit-testable outside of Vercel's runtime.

## 5. Orchestrator (`packages/orchestrator`)

The orchestrator is the backend's reusable core. It is deliberately framework-agnostic so it can be invoked from Vercel functions, Node scripts, or tests.

- `manager/` — LLM director: assembles prompts, chooses a model, calls OpenRouter, parses JSON responses deterministically (`json-extract.ts`), and applies complexity overrides based on tier and request shape.
- `promptsmith/` — Cleans and optimizes raw user input (often Hinglish, shorthand, or conversational) into a strict English prompt specification, with a rule-based deterministic fallback so an LLM hiccup never breaks the pipeline.
- `providers/` — Uniform `Provider` interface plus adapters. Each adapter reports health, cost tier, and can generate images or structured responses. `request-queue.ts` and `keyed-lane.ts` serialize concurrent access to per-key rate limits.
- `keys/` — `KeyPool` and `KeyPoolManager` implement round-robin key selection, cooldown after 429/402, exhaustion detection, and health scoring. Conformance tests verify rotation, backoff, and poison-key isolation.
- `resilience/` — `CircuitBreaker` per provider, `FallbackExecutor` with configurable retries, and an error-classification layer that normalizes upstream failures into stable `UPSTREAM_ERROR` / `RATE_LIMITED` / `TIMEOUT` / `AUTH_INVALID` codes.
- `cost/` — Per-call cost tracker with running totals and per-provider spend breakdown; exposed via metrics.
- `observability/` — Structured logger, Prometheus-shaped counters, in-memory ring buffer of recent requests, and a `/health` endpoint used by Vercel and for smoke tests.
- `api/` — Vercel-ready route handlers, schemas (Zod), rate limiting per tier, and observability hooks.

## 6. AI Provider Strategy

The orchestrator treats model providers as a ranked pool:

- **Primary text:** OpenRouter (`google/gemini-2.5-flash` default, with configurable fallbacks). Keys rotate round-robin; a pool of multiple keys handles the free-tier RPM ceiling.
- **Image primary:** Pollinations (free, no key) for Free-tier thumbnails/storyboards; Fal/Replicate premium paths for Pro/Cinematic tiers.
- **Fallback chain:** On timeout, 5xx, or rate-limit, the orchestrator retries the same provider with the next key, then the next model, then a deterministic synthetic result so the user always sees output.
- **TTS:** ElevenLabs, with static-preview short-circuit on the client to reduce billable calls by ~80%.

## 7. Data Model (Supabase)

- `auth.users` (Supabase-managed) — accounts.
- `profiles` — display name, referral code, tier, qualified-referral counters.
- `referrals` — edge table capturing click/join/qualified events, linked by HMAC-signed tokens.
- `trials` — guest-soft-gate state per browser fingerprint (cookie-signed).
- Referral qualification is computed via a Postgres RPC that atomically checks the "3 invites, at least 1 unlocks Pro" predicate and emits a seven-day Pro grant. This logic lives in the database so it cannot be desynchronized by client races.

All tables use Row-Level Security policies scoped to `auth.uid()`. Service-role calls from Vercel use the `SUPABASE_SERVICE_ROLE_KEY` and bypass RLS only where necessary.

## 8. Security Posture

- **No secrets in the bundle.** CI runs `npm run verify`, which scans the built `dist/` for patterns that look like API keys.
- **Signed cookies for referral attribution.** HMAC with a server-only secret prevents cookie tampering.
- **CORS.** Edge functions emit a strict allow-list in production (see `api/_shared.ts`). Wildcard is permitted only in local dev.
- **Rate limiting.** Per-tier token bucket at the edge (free tier throttled aggressively; cinematic reserved concurrency).
- **Dependency hygiene.** Renovate/Dependabot alerts are triaged weekly; lockfile (`package-lock.json`) is committed.

## 9. Testing

- **Unit/integration** — Vitest, colocated as `*.test.ts` next to the module under test. Focus on orchestrator logic (keys, resilience, manager, promptsmith, routing).
- **Contract** — `scripts/test-v1-contract.ts` compiles with esbuild and hits the running Vercel endpoints (or local dev server) to verify the `/api/v1/*` wire format matches `docs/openapi.yaml`.
- **End-to-end** — Playwright specs in `e2e/specs/` cover tier enforcement, mobile shell, storyboard banner, thumbnail count radio, and the Clone & Crush matrix.
- **Smoke** — `tests/smoke.test.ts` confirms the toolchain bootstraps.

CI (`npm run ci`) runs lint, typecheck, Vitest, and the verifier on every push to `main`.

## 10. Deployment Topology

```
┌──────────────────────┐      ┌───────────────────────┐
│  Vercel (production) │◀────▶│  Supabase (managed)   │
│  - CDN (static SPA)  │      │  - Postgres           │
│  - Edge Functions    │      │  - Auth               │
│  - Node functions    │      │  - RLS + RPCs         │
└──────────┬───────────┘      └───────────┬───────────┘
           │                              │
           ▼                              ▼
   OpenRouter / Gemini /            YouTube Data API v3
   Pollinations / Replicate /       youtube-transcript lib
   HuggingFace / Together /         Piped fallback
   ElevenLabs TTS
```

There is no long-running server. The platform scales to zero and cold-starts per request. Edge functions target global V8 isolates; Node functions are used only where native modules require them.

## 11. Observability & Operations

- **Metrics endpoint:** `GET /api/v1/metrics` returns counters (requests, success, failure, key rotations, latency percentiles, breakers open).
- **Logging:** Console logs are structured as `[scope] key=value …` lines; Vercel aggregates them per deployment.
- **Health:** `packages/orchestrator/observability/health.ts` reports per-provider circuit-breaker state and snapshot counters.
- **Alerts:** Configured in Vercel for 5xx rate and function duration spikes.

## 12. Tech Stack Justification

- **React + Vite** over Next.js: the product is a single-page tool suite, not an SEO-driven content site. Vite gives smaller bundles, faster HMR, and a simpler mental model; Vercel Edge Functions provide server-side logic without framework lock-in.
- **Supabase** over rolling our own auth/DB: managed Postgres with native RLS and social auth eliminates undifferentiated security work; referral RPCs run atomically in the database.
- **Tailwind + Radix/shadcn** over MUI/Ant: composable primitives and a design-token system let us ship a distinctive premium UI while staying accessible.
- **Zustand + React Query** over Redux/RTK: React Query owns server state; Zustand owns UI state; the boundary is explicit and boilerplate stays minimal.
- **Multi-provider orchestration** over a single-vendor SDK: insulates the product from outages, pricing changes, and rate-limit walls; supports a free tier that genuinely runs on zero-cost providers.

## 13. Decision Log (high level)

- **Key rotation lives in the orchestrator, not in config.** Enables dynamic cooldown and health scoring.
- **Tier definitions live in a single server module** (`tiers-handler.ts`) and are exposed to the client via `/api/v1/tiers`; the client never hard-quotas locally.
- **Fallback responses are synthetic but plausible** rather than errors — content-generation products convert better when the user receives an artifact they can edit, rather than a red "failed" state.
- **Referral gating is enforced in Postgres via RPC** rather than application code to prevent double-spend races.
