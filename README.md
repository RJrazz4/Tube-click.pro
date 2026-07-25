# TubeClick Pro

**AI-powered growth operating system for YouTube creators.**

TubeClick Pro consolidates competitive intelligence, AI-assisted content production (scripts, storyboards, thumbnails, voiceover), SEO optimization, and a privacy-conscious viral referral loop into a single tier-aware SaaS product. The platform runs at [tubeclickpro.in](https://tubeclickpro.in).

---

## At a Glance

| Concern | Choice | Rationale |
|---|---|---|
| Frontend | React 18 + TypeScript + Vite | Fast dev server, optimized production builds, mature ecosystem. |
| UI | Tailwind CSS + shadcn/ui + Radix primitives | Accessible, composable, fully themeable headless components. |
| State | Zustand + React Query v5 | Predictable client state + cached server state with automatic refetch/backoff. |
| Backend | Vercel Edge + Node.js serverless functions (root `api/`) | Sub-50ms cold starts at global edge; zero server ops. |
| AI orchestration | Internal `packages/orchestrator` | Multi-provider routing, key rotation, circuit breaking, cost tracking, tier enforcement. |
| Persistence & auth | Supabase (Postgres + Auth + Row-Level Security) | Managed Postgres, social auth, and qualified referral chain logic via RPC. |
| Payments / gating | Locker integration (server-verified entitlements) | Subscription state never trusted from the client. |
| Quality | TypeScript strict, ESLint, Vitest (unit + contract), Playwright (e2e) | CI blocks merges on type/lint/test/verify failures. |
| Deployment | Vercel (primary), Supabase Edge (ancillary) | Production served from Vercel's edge network. |

## Product Modules

- **Clone & Crush** — Reverse-engineer competitor YouTube channels via the YouTube Data API, surface winning formats, and synthesize original scripts, hooks, tags, and thumbnail direction.
- **SEO Optimizer** — High-intent titles, descriptions, and long-tail tag packs generated against real search-language models.
- **Storyboard & Thumbnail Studio** — Tier-aware scene planning with multi-provider image generation, deterministic fallbacks, and per-scene latency/cost telemetry.
- **Voiceover Studio** — Server-side TTS with static previews to minimize upstream call volume by ~80%.
- **TubeBot (Chat Agent)** — Unified OpenRouter-backed chat interface for on-demand content ideation.
- **Viral Referral Loop** — Qualified, HMAC-signed chain-referral system. Referrers earn a seven-day Pro pass only when three invites convert and at least one invitee unlocks Pro (anti-fraud, no fake traffic rewards).

## Repository Layout

```
Tube-click.pro/
├── api/                     # Vercel serverless/edge functions (live HTTP surface)
│   └── v1/                  # Versioned orchestrator endpoints (storyboard, thumbnails, tiers, metrics)
├── apps/
│   └── api/                 # Reference router implementation (kept for parity testing)
├── packages/
│   ├── ai/                  # Legacy lightweight AI client (retained for compatibility)
│   ├── orchestrator/        # Core AI orchestration engine (routing, keys, resilience, cost)
│   │   ├── api/             # Route handlers wired into Vercel functions
│   │   ├── generator/       # Storyboard/thumbnail generation pipeline
│   │   ├── keys/            # Key pool, rotation, cooldown, and exhaustion handling
│   │   ├── manager/         # LLM director + OpenRouter client + complexity planning
│   │   ├── observability/   # Structured logging, metrics, health snapshots
│   │   ├── promptsmith/     # Prompt normalization + deterministic fallbacks
│   │   ├── providers/       # Adapter layer (Gemini, Pollinations, HuggingFace, Replicate, Together, Agnes)
│   │   └── resilience/      # Circuit breakers, retry budgets, fallback executor
│   └── shared/              # Cross-package utilities (env parsing, types)
├── src/                     # React SPA (routed via react-router)
│   ├── api/client/          # Typed API client + React Query bindings
│   ├── components/          # UI primitives (shadcn) + feature components
│   ├── hooks/               # React hooks (data, queries, lazy loading, SEO meta)
│   ├── integrations/supabase/  # Supabase client + auth bindings
│   ├── lib/                 # Domain logic, auth, cache, referrals, monetization
│   ├── pages/               # Route-level pages
│   └── stores/              # Zustand stores
├── public/                  # Static assets (served as-is)
├── scripts/                 # Build/verify tooling + v1 contract test
├── supabase/
│   ├── migrations/          # Postgres schema migrations
│   └── functions/           # Supabase Edge Functions (ancillary; primary path is Vercel)
├── docs/                    # Architecture, runbooks, API spec
├── tests/                   # Vitest unit / integration tests
└── e2e/                     # Playwright end-to-end tests
```

## System Architecture

```
                         ┌────────────────────────────────┐
                         │         Browser (SPA)          │
                         │  React + Vite + Tailwind/Radix │
                         │  Zustand + React Query (cache) │
                         └──────────────┬─────────────────┘
                                        │ HTTPS
                                        ▼
                         ┌────────────────────────────────┐
                         │    Vercel Edge / Frontdoor     │
                         │  rewrite all routes → /index  │
                         │  /api/* functions terminate    │
                         └─────┬──────────────┬───────────┘
                               │              │
              ┌────────────────┘              └────────────────┐
              ▼                                                ▼
  ┌─────────────────────────┐                  ┌─────────────────────────┐
  │   api/_ai.ts, api/v1/*  │                  │  api/referrals.ts,      │
  │  api/seo-tags.ts, ...   │                  │  api/clone-crush.ts,    │
  │  (chat, SEO, storyboard,│                  │  api/transcript.ts,     │
  │   thumbnails, TTS)      │                  │  api/guest-access.ts    │
  └────────────┬────────────┘                  └────────────┬────────────┘
               │                                            │
               ▼                                            ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │              packages/orchestrator (server-side core)                │
  │  Manager  →  Promptsmith  →  Providers  →  Resilience  →  Observability │
  │  (LLM dir)  (prompt norm.)   (multi-adapt.) (circuit/RT/FB) (metrics)  │
  └──────────────────────────────┬───────────────────────────────────────┘
                                 │
            ┌────────────────────┼────────────────────┐
            ▼                    ▼                    ▼
     ┌──────────────┐     ┌─────────────┐     ┌───────────────┐
     │ OpenRouter   │     │   YouTube   │     │   Supabase    │
     │ (primary)    │     │ Data API v3 │     │ Postgres+Auth │
     │ Gemini · HF  │     │ transcripts │     │ Referral RPCs │
     │ Replicate ·  │     │             │     │     RLS       │
     │ Pollinations │     │             │     │               │
     └──────────────┘     └─────────────┘     └───────────────┘
```

**Security model.** No AI provider key, YouTube API key, or payment secret is ever sent to the browser. The client only holds the Supabase anon key and the Vite-injected public app URL. All third-party calls are mediated by Vercel functions, which read secrets from `process.env`. Supabase Row-Level Security and signed HttpOnly cookies enforce entitlement decisions on the server; client-side gating is purely cosmetic.

## Getting Started

### Prerequisites

- Node.js ≥ 20
- npm ≥ 10

### Install & run

```bash
git clone https://github.com/RJrazz4/Tube-click.pro.git
cd Tube-click.pro
npm install
cp .env.example .env            # fill in server-side secrets (see docs/ENVIRONMENT.md)
npm run dev                     # http://localhost:5173
```

### Production-quality checks

```bash
npm run lint                    # ESLint with suppression registry
npm run typecheck               # tsc across app, api, and packages
npm test                        # Vitest unit + integration suite
npm run test:v1-contract        # v1 HTTP contract (storyboard/thumbnail shape)
npm run verify                  # Build-time surface verification
npm run ci                      # All of the above — CI gate
npm run build                   # Production bundle to dist/
```

### End-to-end tests

```bash
npx playwright install          # one-time browser install
npx playwright test             # headless e2e suite in e2e/
```

## Environment & Secrets

Secrets management is documented in [`docs/ENVIRONMENT.md`](docs/ENVIRONMENT.md). The headline rule: **never commit or expose a server key with the `VITE_` prefix.** The `.env.example` file lists every variable with purpose, default, and security classification.

## Deployment

The production target is **Vercel**.

1. Connect the GitHub repository to a Vercel project.
2. Configure environment variables in the Vercel dashboard (do not commit a `.env`).
3. `vercel --prod` deploys the SPA and provisions `api/*.ts` as Edge/Node functions automatically — no extra routing required (see `vercel.json`).
4. Supabase migrations in `supabase/migrations/` are applied via `supabase db push` against the linked project.

## API Reference

The public HTTP surface is specified as an OpenAPI 3.0 document at [`docs/openapi.yaml`](docs/openapi.yaml). Versioned endpoints live under `/api/v1/`; unversioned endpoints (chat, SEO, TTS, referrals, clone-crush, transcript, guest-access, config) remain stable.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). Branch protection on `main` requires the `ci` script to pass and one review before merge. Commits follow the [Conventional Commits](https://www.conventionalcommits.org/) specification.

## Further Reading

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — deep architecture, resilience model, tier policy
- [`docs/ENVIRONMENT.md`](docs/ENVIRONMENT.md) — environment variables and secret handling
- [`docs/PRODUCTION_READINESS.md`](docs/PRODUCTION_READINESS.md) — production runbook, monitoring, incident response
- [`docs/openapi.yaml`](docs/openapi.yaml) — API contract
- [`docs/archive/`](docs/archive/) — historical release notes

## License

Private and proprietary. © TubeClick Pro. All rights reserved.
