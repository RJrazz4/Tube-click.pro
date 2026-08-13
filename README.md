# TubeClick Pro — Autonomous AI Growth Infrastructure

TubeClick Pro is an enterprise-grade, closed-loop content intelligence platform engineered for deterministic YouTube growth at scale. The platform orchestrates multi-agent adversarial reasoning, real-time competitor reverse-engineering, persistent per-creator memory, and multi-layered failover to produce production-ready asset packages — optimized titles, retention-engineered hooks, narration scripts, thumbnail creative briefs, SEO tag clusters, and editing directives — in a single autonomous execution, with zero manual prompting and no chat-style interface in the critical path.

This repository contains the full production deployment: edge runtime, orchestration layer, typed state stores, and the client application. All runtime surfaces are deployed globally on Vercel's Edge Network with regional sub-100ms POP latencies, end-to-end encryption in transit and at rest, and strict Supabase row-level security on every creator-scoped table.

---

## Overview

TubeClick Pro eliminates the manual creative loop between ideation, competitor research, script drafting, and packaging. Once a creator connects a YouTube channel, four autonomous subsystems operate without human intervention:

1. An adversarial Writer ↔ Critic pipeline that iterates drafts against a retention-scored rubric.
2. The Glitch Intensity Engine (Chain-Loop) that profiles a channel, ranks viral outliers by velocity, and reverse-engineers winning formulas into ready-to-publish assets.
3. A persistent channel RAG memory that accumulates niche, tone, banned patterns, and historical performance signals across sessions.
4. A self-healing failover stack (gateway model cascade, per-route deterministic fallbacks, client-level quantum cache) that guarantees a schema-valid response on every request with zero visible error states.

There is no conversational surface, no prompt-engineering burden on the user, and no partial-output spinner. Every execution returns an auditable, five-asset package or a locally-synthesized ghost-reconstructed equivalent.

---

## Core Architecture

### 1. Multi-Agent Adversarial Pipeline (Writer ↔ Critic)

Content generation executes as a closed-loop adversarial workflow between two specialized agents:

- **WriterAgent** drafts title families, 8–10 second open-loop hooks, a full narration script, hashtag clusters, and an SEO description grounded in channel memory, platform context, and any incoming Chain-Loop intelligence.
- **CriticAgent** scores every draft against a three-axis rubric — retention hook cadence (one beat every 8–10 seconds), zero-cliché tolerance, and promise-to-payoff integrity — returning a 0–100 score with machine-readable remediation directives.

Drafts scoring below the release threshold (85/100) are automatically resubmitted to the Writer with the Critic's remediation notes for up to two self-healing iterations. Output that clears threshold is returned to the client with a full audit trail: score, critique, iteration count, self-heal flag, and serving model identifier.

### 2. Autonomous Glitch Intensity Engine (Chain-Loop)

The Chain-Loop subsystem delivers single-click competitor reverse-engineering through three deterministic stages:

- **Auto-Profiling** — Given a YouTube handle or channel URL, the engine scrapes channel metadata, deduces the niche via keyword heuristics over the channel description and extracted topics, and discovers viral outliers (≥50,000 views) across a mesh of public data relays. The deduced niche is persisted as the strict targeting filter for all subsequent competitor fetches, including post-cooldown conveyor shifts, so the queue never drifts out of category.
- **Niche-Strict Daily Conveyor Belt** — A fixed 3-slot queue is maintained per creator: slot 0 is the actionable, unlocked video; slots 1 and 2 are locked teaser tiles surfaced behind a 24-hour cooldown for free-tier users. When the cooldown expires, slot 0 and its generated script are evicted permanently, slot 1 shifts to the unlocked position, slot 2 shifts into slot 1, and one new niche-strict viral video is fetched to fill slot 3. The queue is always exactly three tiles (one actionable, two teasers).
- **Live Velocity Matrix** — Competitors are ranked by viral velocity score (velocity × recency × engagement), with estimated monthly revenue, upload frequency, and niche CPM surfaced alongside each outlier.
- **Reverse-Engineering** — Captions for the selected target are extracted via a multi-node relay mesh with local-synthetic fallback; the Glitch Intensity Engine then rewrites the hook, title, narration, thumbnail brief, SEO tags, and editing guide at tiered intensity (60% Standard for free users, 99% Extreme Glitch for Pro), enforcing Anti-Clone Illusion — analogies, case studies, and vocabulary are deterministically replaced to defeat fingerprinting.
- **Five-Asset Package** — Every run returns title, hook, 150–220 word script, thumbnail prompt, editing guide, SEO tag cluster, and applied glitch techniques with no partial output.

### 3. Persistent Channel RAG Memory

Each connected channel accumulates a structured, session-persistent memory profile:

- Niche classification, target audience fingerprint, preferred tone, and banned clichés.
- Historical performance signals (which hook families outperformed, retention peaks per format).
- Saved channel URL, conveyor queue state, and active cooldown windows — all namespaced per user under a single storage adapter to prevent cross-account leakage.

Memory is injected into every WriterAgent system prompt, giving the engine institutional recall of what has and has not performed for the specific creator and eliminating cold-start generic output on every run. All per-creator state is persisted through a versioned Zustand store with per-user local storage keying and a Supabase-backed server quota for free-tier gating.

### 4. Self-Healing Failover & Deterministic Fallbacks

Production reliability is enforced at three independent layers:

- **Gateway Model Failover** — All LLM traffic routes through a gateway-managed cascade with automatic fallback `google/gemini-2.5-flash → meta-llama/llama-3.3-70b-instruct → openai/gpt-4o-mini`. Failures at any tier are transparent to the client.
- **Per-Route Deterministic Fallbacks** — If the gateway, all fallback models, JSON parsing, or upstream latency budgets fail, every content route returns a locally-synthesized, schema-valid package (titles, hooks, script, tags, description) so end users never observe an error state. Fallback packages are flagged via `ghostReconstructed: true` for observability.
- **Client-Level Quantum Cache** — A two-level response cache (in-memory LRU plus persistent storage) serves stale responses for up to 30 minutes during network partitions, suppressing visible failure entirely.

Edge functions enforce explicit per-call deadlines tuned to path budget (55s for agentic generation, 60s for Chain-Loop rewrite, 15s for thumbnail reverse). Client-side retries are disabled for long-running LLM mutations to prevent phantom "tunnel interference" states.

---

## Technical Stack

| Layer | Technology | Notes |
|---|---|---|
| Edge Runtime | Vercel Edge Functions | Global POP deployment, sub-100ms cold starts, per-route `maxDuration` budgets |
| AI Orchestration | Vercel AI SDK + Vercel AI Gateway | Multi-provider failover, structured outputs, zero client-side retries |
| Primary Models | Google Gemini 2.5 Flash, Meta Llama 3.3 70B Instruct, OpenAI GPT-4o Mini | Three-tier fallback chain managed at the gateway |
| Client Framework | React 18 + TypeScript | Vite build, route-level code splitting, Suspense streaming |
| Styling | Tailwind CSS + shadcn/ui | Custom glass/neon design system, reduced-motion respected |
| Client State | Zustand (versioned, per-user persisted) | Deterministic stores with explicit migrations; TanStack Query for server cache (10-min fresh / 30-min stale-while-revalidate) |
| Backend Data | Supabase (Postgres + RLS + Auth) | Row-level security enforced on every user/profile/referral table |
| Authentication | Supabase Auth + SoftGate provider | Google OAuth with offline access, canonical-domain session pinning, ghost-session protection |
| Tiering & Quota | Server-authoritative daily quota via Supabase SECURITY DEFINER RPCs | 1 Chain-Loop per 24h on free tier; Pro bypasses cooldown; client mirror ticks live countdown |
| Observability | Structured edge logs, request IDs, per-call latency and token usage | Server-side only — no raw provider payloads ever reach the client |
| Deployment | Vercel (production) + GitHub Actions CI | Pre-push gate: import-extension lint, strict TypeScript across all projects, Vite production build, provider-leak string scan |

---

## Repository Layout

```
api/                      # Vercel Edge Functions (one per product surface)
  _shared.js              # CORS, timeout signals, error classification, sanitization
  _ai.js                  # Stable ChatGenerationError wrapper over the AI gateway
  _agenticEngine.js       # Writer ↔ Critic adversarial loop with per-call deadlines
  generate-text.js        # Autonomous five-asset generation endpoint
  clone-crush.js          # Chain-Loop Glitch Intensity Engine + 24h conveyor quota
  analyze-storyboard.js   # Script scene-beat analyzer
  seo-tags.js             # SEO tag cluster generator
  transcript.js           # YouTube caption extraction (multi-relay mesh)
  referrals.js            # Referral attribution and Pro unlock
packages/
  orchestrator/           # Gateway client, tier policy, routing, thumbnail pipeline
  shared/                 # Cross-cutting types, env schemas, tier limits
src/
  pages/                  # Route-level pages (Dashboard, CloneCrush, VoiceStudio, Rewards, Settings, ...)
  components/             # Reusable UI, layout shell, overlays, referral surfaces
  stores/                 # Zustand stores (auth v2, workflow, clone-crush v5, content, app, quota)
  contexts/               # React contexts (SoftGate session sync)
  hooks/                  # Typed hooks (quota, secure query, transcript extraction)
  api/client/             # Typed edge client with resilient cache and client-side timeouts
  lib/                    # Domain logic: canonicalization, referrals, per-user storage, RAG primitives
tests/                    # Vitest unit and conformance suites
scripts/verify.mjs        # Pre-push verification gate runner
```

---

## Reliability & Performance Targets

| Metric | Target |
|---|---|
| Edge P95 latency (asset generation) | < 8s cache hit, < 25s primary model, < 45s post-failover |
| Visible error rate | 0% — deterministic fallback always returns a schema-valid package |
| Initial client bundle | Code-split; heavy tools lazy-loaded via `React.lazy` |
| Test gate | 53 test files, 462 assertions, must pass on every push |
| Type safety | TypeScript strict mode across `tsconfig.app.json`, `tsconfig.api.json`, and `tsconfig.packages.json` with zero errors |
| Data isolation | Supabase RLS on every user-scoped table; per-user local storage keying (`tc:u:<baseKey>:u:<userId>`) |
| Provider-key containment | Zero provider key material ships to the client; keys are read exclusively server-side from Vercel environment variables |

---

## Security & Privacy

- All AI provider credentials live in Vercel environment variables; they are never exposed to the client or echoed through user-facing error payloads.
- Raw provider errors are classified server-side and mapped to a stable `FriendlyError` envelope before transit.
- OAuth flows execute exclusively against the canonical production domain; temporary preview hosts trigger an automatic redirect overlay to prevent split-session leaks.
- All generated content is scoped to the authenticated creator's account and protected by Supabase RLS on both read and write paths.
- Local-storage state is namespaced per authenticated user ID, with a pinned last-auth-user key ensuring guests and signed-in accounts never share persisted state.

---

## Deployment Setup

### Prerequisites

- Node.js 20+ and npm 10+
- A Vercel account linked to the repository
- A Supabase project with the required Auth, RLS, daily-quota, and referral RPCs deployed
- API keys for the routed AI providers, configured in Vercel environment variables

### Local Development

```bash
# 1. Install dependencies
npm install --no-audit --no-fund

# 2. Copy the environment template and populate provider / Supabase values
cp .env.example .env.local

# 3. Start the Vite development server
npm run dev

# 4. Run edge endpoints locally via the Vercel CLI (optional, for API work)
vercel dev
```

### Verification Gates

The following must pass cleanly before any push to `main`:

```bash
npm run lint        # ESLint with suppressions file
npm run typecheck   # Strict TypeScript across app, API, and packages
npm test -- --run   # Vitest suites
npm run verify      # Custom gate: import extensions, strict TS, Vite build, provider-leak scan
```

### Production Deployment

Pushes to `main` are deployed automatically by Vercel. The four-gate verification script (`scripts/verify.mjs`) runs in CI and blocks deployments on any regression: missing `.js` extensions in edge imports, TypeScript strict errors, production build failures, or accidental leakage of provider names into user-facing strings.

Edge function runtime is pinned to Vercel Edge (`export const config = { runtime: 'edge' }`) with explicit `maxDuration` caps, and all Supabase service-role access is scoped to SECURITY DEFINER RPCs to minimize blast radius.

---

## Licensing

**PROPRIETARY AND CONFIDENTIAL**

Copyright © 2026 TubeClick Pro. All rights reserved.

This repository and all source code, build artifacts, configuration, prompts, model routing logic, Glitch Intensity heuristics, Chain-Loop orchestration, referral architecture, and contained intellectual property are the exclusive property of TubeClick Pro.

Unauthorized copying, distribution, reproduction, modification, public display, performance, or reverse engineering of this repository — in whole or in part, via any medium, including but not limited to AI-assisted training, model distillation, or fork redistribution — is strictly prohibited and will be enforced to the fullest extent of applicable law.

Access to this repository is granted solely to authorized engineers and contractors bound by a current non-disclosure and licensing agreement with TubeClick Pro. If you have received this code in error, notify the owner immediately and delete all copies.
