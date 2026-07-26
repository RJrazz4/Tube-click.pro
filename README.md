# TubeClick Pro — Autonomous AI Growth Infrastructure

TubeClick Pro is a proprietary, closed-source enterprise engine purpose-built for automated short-form content generation and psychological audience retention at scale. The platform orchestrates multi-agent AI reasoning, real-time competitor reverse-engineering, persistent channel memory, and self-healing failover to produce production-ready YouTube assets — titles, retention-optimized hooks, 60-second narration scripts, thumbnail creative, SEO tag clusters, and editing guides — in a single autonomous run, with zero manual prompting and zero chat-style interfaces.

This repository contains the complete production deployment: edge runtime, orchestration layer, state stores, and the client application. All infrastructure is deployed globally on Vercel's Edge Network with regional sub-100ms POP latencies and end-to-end encryption at rest and in transit.

---

## Core Architecture

TubeClick Pro is organized around four autonomous systems that run without human intervention once a creator's channel is connected. There is no manual prompt entry, no chat surface, and no conversational agent — every output is produced by deterministic, observable, self-correcting pipelines.

### 1. Multi-Agent Adversarial Pipeline (Writer ↔ Critic)

Content generation is executed as a closed-loop adversarial workflow between two specialized agents:

- **WriterAgent** drafts viral title families, 8–10 second open-loop hooks, a 60-second narration script, hashtag clusters, and an SEO description grounded in channel memory, platform context, and any incoming Chain-Loop intelligence.
- **CriticAgent** scores every draft against a three-axis rubric — retention hook cadence (one beat every 8–10 seconds), zero-cliché tolerance, and promise-to-payoff integrity — returning a 0–100 score with precise remediation directives.

Drafts that score below the release threshold (85/100) are automatically resubmitted to the Writer with the Critic's remediation notes, for up to two self-healing iterations. Output that meets threshold is returned to the client with a full audit trail (score, critique, iteration count, self-heal flag, serving model).

### 2. Autonomous Glitch Intensity Engine (Chain-Loop)

The Chain-Loop subsystem delivers done-for-you competitor reverse-engineering in one click:

- **Auto-Profiling**: Given a YouTube handle or channel URL, the system scrapes channel metadata, auto-deduces the niche, and discovers viral outliers (≥50k views) across six public data relays.
- **Live Velocity Matrix**: Competitors are ranked by viral velocity score (velocity × recency × engagement), with estimated revenue and niche CPM surfaced alongside each outlier.
- **Reverse-Engineering**: For the selected target, captions are extracted via a mesh of third-party nodes with local-synthetic fallback; the Glitch Intensity Engine then rewrites the hook, title, narration, thumbnail creative, SEO tags, and editing guide using tiered intensity — 60% Standard for free users, 99% Extreme Glitch for Pro subscribers — enforcing Anti-Clone Illusion (analogies, case studies, and vocabulary deterministically replaced).
- **Five-Asset Package**: Every run returns title, hook, 150–220 word script, thumbnail prompt, editing guide, SEO tag cluster, and glitch techniques — no spinner, no partial output, no "rerouting" dead ends.

### 3. Persistent Channel RAG Memory

Every connected channel accumulates a structured memory profile that persists across sessions and generations:

- Niche classification, target audience, preferred tone, and banned clichés.
- Past success signals (which hooks outperformed, retention peaks per format).
- Referral-sourced growth velocity and unlock state.

Memory is injected into every WriterAgent system prompt, giving the engine institutional recall of what has and hasn't performed for the specific creator — eliminating cold-start generic output on every run.

### 4. Self-Healing Failover & Deterministic Fallbacks

Production reliability is enforced at three layers:

- **Gateway-Level Model Failover**: All LLM traffic routes through the Vercel AI Gateway with automatic fallback `google/gemini-2.5-flash → meta-llama/llama-3.3-70b-instruct → openai/gpt-4o-mini`. Failures at any tier are transparent to the client.
- **Per-Route Deterministic Fallbacks**: If the gateway, all fallback models, JSON parsing, or upstream latency budgets fail, every content route returns a locally-synthesized, schema-valid package (titles, hooks, script, tags, description) so users never see an error state. Fallback packages are flagged via `ghostReconstructed: true` for observability.
- **Client-Level Quantum Cache**: A two-level response cache (in-memory LRU + `localStorage`) serves stale responses for up to 30 minutes during network partitions, suppressing visible failure entirely.

Edge functions enforce explicit per-call deadlines tuned to their path budget (55s for agentic generation, 60s for Chain-Loop rewrite, 15s for thumbnail reverse), and client-side retries are disabled for long-running LLM mutations to prevent phantom "tunnel interference" states.

---

## Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Edge Runtime | Vercel Edge Functions | Global POP deployment, sub-100ms cold starts, per-route `maxDuration` budgets |
| AI Orchestration | Vercel AI SDK + Vercel AI Gateway | Multi-provider failover, structured outputs, zero client-side retries |
| Primary Models | Google Gemini 2.5 Flash, Meta Llama 3.3 70B Instruct, OpenAI GPT-4o Mini | Three-tier fallback chain managed at the gateway |
| Client Framework | React 18 + TypeScript | Vite build, route-level code splitting, Suspense streaming |
| Styling | Tailwind CSS + shadcn/ui | Custom neon/glass design system, reduced-motion respected |
| State | Zustand (client), TanStack Query (server cache) | Deterministic stores, 10-min fresh / 30-min stale-while-revalidate |
| Backend Data | Supabase (Postgres + RLS + Auth) | Row-level security on all user/profile/referral tables |
| Observability | Structured edge logs, request IDs, per-call latency + token usage | Server-side only — no raw provider payloads ever reach the client |
| Authentication | Supabase Auth + SoftGate | OAuth (Google) + email, ghost-session protection |
| Payments & Tiering | In-app referral unlock (₹0 Pro via 3-node invite loop) | Referral tracker, ghost uplink QR artifact, XP/streak system |
| Deployment | Vercel (production), GitHub Actions CI | 4-gate pre-push verification: import extensions, strict TS, Vite build, provider-leak scan |

---

## Repository Layout

```
api/                    # Vercel Edge Functions (one per product surface)
  _shared.ts            # CORS, timeout signals, error classification, sanitization
  _ai.ts                # Stable ChatGenerationError wrapper over the AI gateway
  _agenticEngine.ts     # Writer ↔ Critic adversarial loop with per-call deadlines
  generate-text.ts      # Autonomous content-generation endpoint (5 assets)
  clone-crush.ts        # Chain-Loop Glitch Intensity Engine
  analyze-storyboard.ts # Script scene-beat analyzer
  seo-tags.ts           # SEO tag cluster generator
  transcript.ts         # YouTube caption extraction (multi-relay)
  referrals.ts          # Referral attribution + Pro unlock
packages/
  orchestrator/         # Gateway client, tier policy, routing, thumbnail pipeline
  shared/               # Cross-cutting types, env schemas, limits
src/
  pages/                # Route-level pages (Dashboard, CloneCrush, VoiceStudio, Rewards, ...)
  components/           # UI library, layout shell, referral artifacts, overlays
  stores/               # Zustand stores (auth, workflow, clone-crush, content, app)
  api/client/           # Typed edge client with resilient cache + timeouts
  lib/                  # Domain logic: domain canonicalization, referrals, cache, RAG memory primitives
tests/                  # Vitest unit + conformance suites (462 tests, 53 files)
scripts/verify.mjs      # Pre-push gate runner (TS strict + build + provider-leak scan)
```

---

## Performance & Reliability Targets

| Metric | Target |
|---|---|
| Edge P95 latency (asset generation) | < 8s on cache hit, < 25s on primary model, < 45s post-failover |
| Visible error rate | 0% (deterministic fallback always returns a valid package) |
| Client-side bundle (initial) | Code-split; heavy tools lazy-loaded via `React.lazy` |
| Test coverage gate | 53 test files, 462 assertions, must pass on every push |
| Type safety | TypeScript strict mode (`tsconfig.app.json` + `tsconfig.api.json`) zero errors |
| Data isolation | Supabase RLS on every user table; no provider key material ever ships to the client |

---

## Security & Privacy

- All AI provider keys live in Vercel environment variables; they are never exposed to the client or logged in user-facing errors.
- Raw provider error payloads are classified server-side and mapped to a stable `FriendlyError` envelope before transit.
- OAuth flows execute exclusively against the canonical domain (`tubeclickpro.in`); temporary preview hosts trigger an automatic redirect overlay to prevent split-session leaks.
- All content generated through the platform is scoped to the authenticated creator's account and protected by Supabase RLS.

---

## Licensing & Copyright

**PROPRIETARY AND CONFIDENTIAL**

Copyright © 2026 TubeClick Pro. All rights reserved.

This repository and all source code, build artifacts, configuration, prompts, model routing logic, Glitch Intensity heuristics, Chain-Loop orchestration, referral architecture, and contained intellectual property are the exclusive property of TubeClick Pro.

Unauthorized copying, distribution, reproduction, modification, public display, performance, or reverse engineering of this repository — in whole or in part, via any medium, including but not limited to AI-assisted training, model distillation, or fork redistribution — is strictly prohibited and will be enforced to the fullest extent of applicable law.

Access to this repository is granted solely to authorized engineers and contractors bound by a current non-disclosure and licensing agreement with TubeClick Pro. If you have received this code in error, please notify the owner immediately and delete all copies.
