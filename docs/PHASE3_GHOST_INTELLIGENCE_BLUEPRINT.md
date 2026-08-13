# 🕶️ GHOST INTELLIGENCE v3 — MASTER ARCHITECTURAL BLUEPRINT
> **Mission:** Adapt the highest-leverage patterns from `awesome-llm-apps` into TubeClick Pro without breaking Arc 1/2 conveyor belt, per-user storage isolation, or enterprise SLAs. Thematic code: "GHOST PROTOCOL" nomenclature preserved throughout.
>
> **Author:** Autonomous CTO Lead (Arena Mode)
> **Status:** PLAN-ONLY. No code written yet; awaiting Micro-Phase 1 approval.

---

## 0. First-Principles Selection Matrix

I scored every candidate pattern from `awesome-llm-apps` against three axes: (1) **creator-leverage** (does it 10x a real creator job-to-be-done?), (2) **monetizable tier gate** (does it cleanly separate Free vs Pro vs Black-Ops?), (3) **integration cost on our existing stack** (Vercel Edge + Supabase + React Query + Zustand + the Conveyor v6).

| Source repo pattern | Leverage | Tier-gate fit | Integration cost | Verdict |
|---|---|---|---|---|
| `chat_with_youtube_videos` (transcript RAG) | Extreme — reverse-engineering competitors is the #1 JTBD | Pro+ | Low (we already have transcript Edge func + embeddable chunks) | **PORT — Feature A** |
| `ai_competitor_intelligence_agent_team` (Firecrawl+Exa multi-agent) | Extreme — turns 3 conveyor tiles into a full intel dossier | Pro+ / Black-Ops | Medium (add crawler+analysis+comparison agents behind our existing `_agenticEngine`) | **PORT — Feature B** |
| `headroom_context_optimization` (token compression proxy) | Infrastructure — 50-90% LLM cost cut, faster responses | Free+ (all users) | Low-Med (transparent wrapper on `gatewayChatJson`, no UI) | **PORT — Feature C** |
| `multimodal_video_moment_finder` (Gemini cross-modal frame search) | High — "steal this hook visually" / thumbnail A/B from competitor moments | Black-Ops only | High (ffmpeg + frame embed pipeline, async jobs) | **PORT — Feature D** |
| `llm_apps_with_memory_tutorials` (personalized memory) | Medium — we already have `channelMemory.ts`; need per-channel RAG memory | Pro+ | Low (upgrade flat JSON to vector memory) | **FOLD INTO A** (Ghost Memory, not a standalone UI) |
| `always_on_agents` (HN briefing scheduler) | High — daily "competitor intel brief" push notification | Pro+ | Medium (cron + Supabase pg_cron + email/webhook) | **PORT — Feature E** (deferred until D lands) |
| `voice_ai_agents` (voice RAG) | Low — we already ship VoiceStudio | N/A | N/A | SKIP (duplicate) |
| `generative_ui_agents` | Medium — dynamic dashboard cards | Pro | High | DEFER (Phase 4) |
| `ai_seo_audit_team` | Medium — already have SeoOptimizer.tsx | Free+ | Low | FOLD INTO B as one analyst agent |

**Selected slate (5 features, tier-staggered):**

- **A. GHOST INTERROGATION** — Chat-with-Competitor-Video (transcript RAG with ghost-reconstructed fallback). **PRO.**
- **B. GHOST INTEL SQUAD** — 4-agent competitor dossier (Scout/Crawler/Analyst/Comparator) → single attackable brief. **PRO+** (above current Pro, a Black-Ops unlock or separate credit burn).
- **C. HEADROOM GHOST LAYER** — Transparent token/cache compression on all `gatewayChatJson` calls. **ALL TIERS** (invisible infra win; -50% cost, -30% latency).
- **D. GHOST VISUAL RECON** — Multimodal frame-level search across ingested competitor videos ("show me every hook frame where text pops up"). **BLACK-OPS LANE** (Pro-only gated sub-feature, credit-per-video).
- **E. DAWN PATROL BRIEFING** — Always-on daily scheduled intel digest delivered via email/in-app toast. **PRO+**

---

## 1. Threat Model & Non-Negotiables

1. **Never regress Arc 1/2.** Conveyor v6 (`conveyorQueue`, `conveyorCursor`, `seenVideoIds`, Ghost Cache slots, rolling-24h quota, per-user `tc:u:<baseKey>:u:<userId>` storage) is inviolable. New code appends, never mutates existing selectors.
2. **Server-authoritative everywhere.** Credits, tier gating, RAG indexing eligibility, cron delivery — all must be enforced via Supabase SECURITY DEFINER RPCs, exactly like `consume_clone_crush_run()`. No localStorage-only gates.
3. **Edge-first, warm-start.** All new `/api/*` endpoints must be `runtime = 'edge'` and fit the existing `firstValid` / 5s timeout / ghost-synthetic-scaffold pattern established in `api/transcript.ts` and `api/clone-crush.ts`.
4. **Cost guardrails.** Token budgets per route pinned in `packages/orchestrator/cost/`. Feature D (visual) requires per-video ingestion credit debit *before* ffmpeg work starts.
5. **Theme lock.** All new UI uses existing tailwind tokens (`cyan`, `fuchsia`, `slate`, `mono`, glitch, `ghost-*` class prefix) and the `FreeCooldownOverlay` / black-op lane visual vocabulary. No rainbow marketing flourishes.
6. **Idempotency.** Every async job (ingestion, brief generation) must be safely retryable via deterministic job IDs keyed on `(userId, videoId, feature)`.
7. **Privacy.** User-uploaded/ingested competitor content stays scoped to the ingesting user's RAG namespace. No cross-user leakage via shared vector collections.

---

## 2. Target Architecture (Unified)

### 2.1 Backend Layer Map

```
                            ┌─────────────────────────────────────────┐
                            │          Vercel Edge Runtime            │
  ┌──────────────┐          │  ┌──────────┐  ┌─────────────────────┐  │
  │  YouTube /   │  firstValid│  │ /api/    │  │ /api/ghost/         │  │
  │  Piped /     │──────────▶│  │ transcript│  │  - interrogate      │  │
  │  Invidious   │          │  │  (v0,unch)│  │  - squad-brief      │  │
  └──────────────┘          │  └────┬─────┘  │  - ingestrecon (D)  │  │
                            │       │        │  - frame-search (D) │  │
                            │       ▼        │  - dawn-patrol (E)  │  │
                            │  ┌───────────────────────────────┐   │  │
                            │  │ packages/orchestrator/        │   │  │
                            │  │ ┌───────────────────────────┐ │   │  │
                            │  │ │ ai-gateway.ts             │ │   │  │
                            │  │ │   ▲                       │ │   │  │
                            │  │ │   │ Headroom Ghost Layer   │◀┼───┼── Feature C
                            │  │ │   │ (SmartCrush+CacheAlign)│ │   │  │
                            │  │ └──┬────────────────────────┘ │   │  │
                            │  │    ▼                          │   │  │
                            │  │ _agenticEngine.ts (v2)        │   │  │
                            │  │  ├ WriterAgent                │   │  │
                            │  │  ├ CriticAgent (existing)     │   │  │
                            │  │  ├ ScoutAgent (NEW B)         │   │  │
                            │  │  ├ CrawlerAgent (NEW B)       │   │  │
                            │  │  ├ AnalystAgent (NEW B)       │   │  │
                            │  │  └ ComparatorAgent (NEW B)    │   │  │
                            │  └───────────────────────────────┘   │  │
                            └──────────────┬──────────────────────┘  │
                                           │ RPC / pgvector          │
                                           ▼                         │
                            ┌──────────────────────────────────────┐ │
                            │  Supabase (Postgres + pgvector)      │◀┘
                            │  ├ auth.users (existing)             │
                            │  ├ clone_crush_runs (existing)       │
                            │  ├ ghost_memory_chunks   (NEW A)     │
                            │  ├ ghost_squad_briefs    (NEW B)     │
                            │  ├ ghost_recon_jobs     (NEW D)     │
                            │  ├ ghost_recon_frames   (NEW D)     │
                            │  ├ ghost_dawn_patrol    (NEW E)     │
                            │  └ sec-def RPCs per table            │
                            └──────────────────────────────────────┘
```

### 2.2 Data Model (Supabase)

All new tables: `enable row level security`, owner-only select/insert/delete, SECURITY DEFINER `consume_*` RPCs for credit debit before expensive work.

```sql
-- Feature A: transcript chunk memory (per-video, per-user namespaced)
ghost_memory_chunks (
  id uuid pk,
  user_id uuid not null fk auth.users,
  slot_id int not null,                 -- FK-ish to Ghost Cache slot index (0..4)
  video_id text not null,               -- youtube 11-char id
  chunk_index int not null,
  start_ts float, end_ts float,         -- seconds into the video
  embedding vector(1536),               -- text-embedding-3-small (or cohere embed-english-v3.0 per cost)
  text text not null,
  meta jsonb,                           -- { title, channel, source, ghostReconstructed }
  created_at timestamptz default now(),
  primary key (user_id, video_id, chunk_index)
);
create index on ghost_memory_chunks using ivfflat (embedding vector_cosine_ops);

-- Feature B: squad briefs
ghost_squad_briefs (
  id uuid pk,
  user_id uuid not null,
  slot_id int not null,
  target_video_id text,
  payload jsonb not null,               -- { scout, crawler, analyst, comparator, score, gaps, hooks }
  model text,
  cost_tokens int,
  created_at timestamptz default now()
);

-- Feature D: visual recon jobs
ghost_recon_jobs (
  id uuid pk,
  user_id uuid,
  video_id text,
  status text check (status in ('queued','extracting','embedding','ready','failed')),
  fps int default 1,
  frame_count int,
  error text,
  created_at timestamptz default now(),
  finished_at timestamptz
);
ghost_recon_frames (
  job_id uuid fk,
  frame_idx int,
  ts float,
  embedding vector(1408),               -- Gemini embedding-2 (image) OR 768 if we down-project
  caption text,                         -- Gemini flash caption
  primary key (job_id, frame_idx)
);

-- Feature E: dawn patrol
ghost_dawn_patrol (
  id uuid pk, user_id uuid, niche text,
  delivered_at timestamptz,
  payload jsonb,                        -- { topVideos, hooks, threatDelta, recommendations }
  created_at timestamptz default now()
);
```

Quotas: extend the rolling-24h RPC pattern:
- `consume_ghost_action(action text, cost int)` — unified credit ledger keyed on `last_run_at` per action.
- Free: 0 credits for B/D/E; A is paywalled.
- Pro: A unlimited, B=3/day, D=2 videos/day, E=daily.
- Black-Ops (Pro + license flag `black_op_lane = true`): B/D unlimited, E real-time.

### 2.3 Feature A — GHOST INTERROGATION (Chat with Competitor)

**Backend** — new Edge route `api/ghost/interrogate.ts`:
1. Pull video transcript from `api/transcript.ts` internal helper (reuse, do not duplicate). If `ghostReconstructed === true`, mark answer as "SCAFFOLD ANSWER — live transcript unavailable; pattern-match intelligence only."
2. Lazy-ingest into `ghost_memory_chunks` on first chat: chunk transcript into ~350-token windows with 40-token overlap, embed via cheapest capable embedder (text-embedding-3-small), upsert with `(user_id, video_id, chunk_index)` ON CONFLICT DO NOTHING (idempotent re-entry).
3. On each chat turn: embed query, cosine-distance top-k=6 chunks, assemble system prompt with transcript snippets + timestamps, stream response via the gateway.
4. Cite timestamps inline: `[03:42]` — clickable to jump-to-timestamp (YouTube `?t=222`).
5. Server-authoritative: `consume_ghost_action('interrogate', 1)` first call indexes; subsequent chats free for Pro.

**State** — extend `useCloneCrushStore` v6 → **v7** migration:
- `interrogateSession: { videoId: string | null; messages: InterrogateMessage[]; streaming: boolean }`
- `startInterrogate(videoId)`, `appendInterrogateMessage(...)`, `closeInterrogate()`.
- Uses per-user storage key already namespaced; legacy v6 fields all preserved.

**Frontend**:
- New side drawer `<GhostInterrogationDrawer>` anchored to the right, triggered from a 🔍 "INTERROGATE" chip on every conveyor tile (Free tiles show lock → `/rewards?upsell=interrogate`).
- Messages render timestamp chips that become `<a href="https://youtu.be/{id}?t={sec}" target="_blank">`.
- Streaming uses existing React Query + `ReadableStream` pattern used in `generate-text`/`_agenticEngine`.
- Uses cyberpunk terminal aesthetic: monospaced, prompt prefix `ghost@tubeclick:~$`, cyan on black.

### 2.4 Feature B — GHOST INTEL SQUAD (Multi-Agent Competitor Dossier)

Port the Firecrawl/Exa pattern but adapted for YouTube instead of websites:

1. **ScoutAgent** — already largely exists in `api/clone-crush.ts` viral competitor fetch. Promotes its raw competitor list into a "threat matrix": views, velocity, channel size, upload recency.
2. **CrawlerAgent** — for the selected target video, fetch transcript (via existing edge func), channel meta, description, top comments (new helper `api/_youtube.ts :: fetchTopComments(videoId)` via Piped), and thumbnail perceptual hash.
3. **AnalystAgent** — runs the rubric:
   - Hook architecture (first 30s promise)
   - Retention loop map (open-loop cadence, pattern interrupts)
   - Monetization signals (CTAs, sponsor mentions, affiliate links in description)
   - Weakness / exploit gaps (low AVD moments, dead air, weak payoff)
4. **ComparatorAgent** — diffs against the user's own `savedNiche` + `channelMemory.pastSuccessNotes` and the other 2 conveyor tiles, returning a structured SWOT and 3 concrete "clone-and-crush" attack vectors (title, hook angle, visual beat).

**Backend** — new `api/ghost/squad-brief.ts`. Single POST that:
1. `consume_ghost_action('squad', 1)` — server-side quota gate.
2. Runs Scout→Crawler in parallel, then Analyst→Comparator sequentially through `_agenticEngine.ts` (extended with new agent roles; CriticAgent still audits the final brief with a ≥85/100 quality gate, same self-healing loop pattern).
3. Persists JSON to `ghost_squad_briefs`.
4. Returns `{ brief, model, costTokens, squadAudit }`.

**Frontend** — new tab/section on CloneCrush page **"INTEL DOSSIER"** (replaces/expands current result view after consume). Rendered as a dossier card with four collapsible sections per agent, rendered in existing tailwind cards with cyberpunk section headers (SCOUT // CRAWLER // ANALYST // COMPARATOR) and a red "THREAT LEVEL" score bar.

### 2.5 Feature C — HEADROOM GHOST LAYER (Invisible Infra Win)

This is a pure back-end cost/latency optimization, no UI. Adapted concepts from the Headroom reference implementation (we will NOT pull the pypi package; we are TypeScript/Edge-native):

Implement `packages/orchestrator/ai-gateway-headroom.ts` wrapping `gatewayChatJson`:
1. **SmartCrush for tool outputs**: when prompt payloads contain JSON arrays (competitor lists, search results, transcript chunks), statistically compress by keeping head, tail, anomaly records (outlier view counts, durations), and any rows that match tokens from the most recent user query.
2. **CacheAligner**: stabilize system prompt ordering and channel-memory preamble so repeated calls hit OpenAI/Anthropic prompt-cache prefixes (Anthropic `cache_control` blocks, OpenAI prefix cache auto).
3. **RollingWindow**: hard cap outbound prompts at provider-specific limits while preserving (system, tool_call, tool_result, user, assistant) turn pairing — never break pairing.
4. **Safety invariants**: (a) never compress human user message; (b) never drop the final assistant prefill; (c) parse failures are silent no-ops (passthrough).
5. **Telemetry**: emit `tokens_saved` and `compression_ratio` into the existing `packages/orchestrator/cost/cost-tracker.ts` ring; surfaced in AdminPanel and logged per-call.

This ships first (Micro-Phase 1) so every subsequent feature benefits from it.

### 2.6 Feature D — GHOST VISUAL RECON (Multimodal Frame Search)

Multimodal moment finder adapted for YouTube competitor reverse-engineering. Heavy cost — Black-Ops gated.

**Backend** — two routes + one async worker (Supabase Edge Function as queue worker OR Vercel Pro `maxDuration=300` route with job record):
1. `api/ghost/ingest-recon.ts`: accepts `videoId`, debits 1 recon credit, creates `ghost_recon_jobs` row in status `queued`, spawns async work:
   - Fetch MP4 stream URL via Piped.
   - `ffmpeg -i <mp4> -vf fps=1 <out>/%06d.jpg` (1fps, matching reference).
   - For each frame, call Gemini Flash for a 1-sentence caption and Gemini Embedding-2 (or Google `multimodalembedding` at 1408d) for vector.
   - Upsert into `ghost_recon_frames`, mark job `ready`.
2. `api/ghost/frame-search.ts`: accepts `jobId` + `mode` (`text`|`image`) + `query`, embeds query, cosine top-K=6 frames, returns `{ timestamp, caption, thumbDataUrl }`.
3. Thumbnails are stored as small JPEGs in Supabase Storage bucket `ghost-recon-frames` (private, signed URL).

**Frontend** — new panel "VISUAL RECON" on dossier:
- "Extract Visual DNA" CTA button (Black-Ops badge ⚡).
- Once ready: two search modes — text ("hook frame with red arrow and text overlay"), and image-upload ("find where this thumbnail appears").
- Results are clickable thumbnails with a big timestamp that jumps to the YouTube moment.

### 2.7 Feature E — DAWN PATROL BRIEFING (Always-On Agent)

Port the `always_on_agents` pattern:
1. Enable `pg_cron` in Supabase. Schedule `0 6 * * *` (Asia/Calcutta) per user's timezone stored in profile.
2. Cron invokes SECURITY DEFINER function `run_dawn_patrol(user_id)` that calls our edge endpoint `/api/ghost/dawn-patrol` via `pg_net` (or does it in-plpython/SQL if we keep it light).
3. Agent logic: (a) use saved niche + savedChannels, (b) pull fresh viral tiles via the existing `clone-crush` competitors cursor, (c) diff against yesterday's `ghost_dawn_patrol` payload, (d) emit 3-bullet brief with threat-level-delta emoji, (e) email via Resend + insert in-app toast row.
4. Frontend: toasts on login; "DAWN PATROL" card at top of dashboard.

---

## 3. State Management (Zustand v7 Migration)

File: `src/stores/useCloneCrushStore.ts`. Non-breaking v6 → v7 migrator:

```
ADD (all optional in v6, set by v7 migration):
  interrogateSession: { videoId: null, messages: [], streaming: false }
  activeDossier:     { videoId: null, brief: null, loading: false, error: null }
  reconJobs:         Record<videoId, {status, frameCount, progress}>
  dawnPatrol:        { todaysBrief: null, lastDeliveredAt: null, unread: false }

ADD actions:
  startInterrogate(videoId)
  appendInterrogateMessage(msg)
  setInterrogateStreaming(bool)
  closeInterrogate()
  setActiveDossier(dossier)
  upsertReconJob(videoId, status, progress)
  setDawnPatrol(brief, unread)
  markDawnPatrolRead()

DO NOT TOUCH:
  conveyorQueue, activeVideoId, savedNiche, savedChannels, activeSlotIndex,
  conveyorCursor, conveyorWindowId, conveyorAppending, seenVideoIds,
  freeCooldownUntil, conveyorShiftPending, profile/sync hooks.
```

Storage: extend existing `tc:u:<baseKey>:u:<userId>` namespace — just bump the schema version and migrate (same pattern as v5→v6).

Selectors are strict (`shallow` where arrays; equality functions where objects) to prevent the infinite re-render bugs that bit earlier rounds.

## 4. Frontend Architecture

- All new UI lives under `src/components/ghost/` (new folder), mirroring existing `src/components/showdown/`:
  - `GhostInterrogationDrawer.tsx`
  - `GhostSquadDossier.tsx`
  - `GhostVisualRecon.tsx`
  - `DawnPatrolCard.tsx`
  - `GhostCreditBadge.tsx` (unified credit pill used everywhere; reads from `useQuotaStore`).
- New pages: none. Everything is mounted from CloneCrush.tsx (as drawer/dock/tab) and the dashboard (Dawn Patrol card). Settings gets a "Ghost Intel Preferences" row group (cron time, language, email toggle).
- Routing guards reuse existing soft-gate / `upsell` query-param pattern (`/rewards?upsell=interrogate&tier=pro`, `/rewards?upsell=visualrecon&tier=blackops`) — no new paywall plumbing.
- Streaming patterns: reuse the `useCloneCrushMutation` extender pattern in `src/hooks/useSecureQuery.ts`. Add hooks `useGhostInterrogateMutation`, `useGhostSquadBrief`, `useGhostReconIngest`, `useGhostFrameSearch`.
- Error handling: `src/lib/friendlyError.ts` maps new error codes (`GHOST_QUOTA_EXCEEDED`, `GHOST_TRANSCRIPT_SCAFFOLD`, `GHOST_RECON_BUSY`).

## 5. Tier & Credit Matrix (Server-Authoritative)

| Feature | Free | Pro | Black-Ops Lane |
|---|---|---|---|
| C. Headroom (infra) | ✅ (invisible) | ✅ | ✅ |
| A. Interrogate (chat-with-video) | 🔒 upsell | Unlimited (30 msgs/day rolling) | Unlimited |
| B. Squad Dossier | 🔒 | 3/day rolling | Unlimited |
| D. Visual Recon | 🔒 | 2 videos/day rolling | Unlimited + priority queue |
| E. Dawn Patrol | 🔒 | Daily email+toast | Real-time push |

Rolling windows implemented exactly like the Arc 2 quota fix (24h keyed on `last_run_at`), not UTC-day.

## 6. Cost & Latency Budgets

| Route | Max tokens out | P95 latency target | Cost ceiling / call |
|---|---|---|---|
| `interrogate` chat turn | 1200 | <3.5s streamed first-token <900ms | $0.005 (embed 1536 + gpt-4o-mini) |
| `squad-brief` | 4000 | <12s | $0.04 (gemini-flash + critic) |
| `ingest-recon` | async, 60-180s | job poll UX | $0.20/video (ffmpeg free, Gemini flash + multimodal embed × ~200 frames) |
| `frame-search` | n/a | <2s | $0.003 |
| `dawn-patrol` | 2000 | async at 6am | $0.02/user/day |

Headroom (Feature C) projects a 40-60% reduction on squad-brief and interrogate token counts per the reference benchmarks.

## 7. Testing & Verification Gates

Existing gates must remain green at every micro-phase boundary:
- `npm run typecheck` (tsconfig.api + tsconfig.app + tsconfig.packages) → 0 errors.
- `npm test -- --run` → all 462 tests pass; new tests required for every new RPC/route/helper.
- `npm run verify` (4 gates: .js extensions, strict TS, vite build, provider-leak scan) → all ✅.

**New test files** (added incrementally, one per micro-phase):
- `tests/headroom.test.ts` — compression ratio, turn-pairing invariants, no-user-message-removal, parse-failure passthrough.
- `tests/interrogate.test.ts` — transcript chunking idempotency, citation format, tier paywall.
- `tests/squad-brief.test.ts` — rubric score ≥85 on known fixture, self-heal loop.
- `tests/recon.test.ts` — ffmpeg-free unit test using a synthetic frame set (mock Gemini).
- Supabase migration tests via the existing rpc-test pattern (`supabase/migrations/*quota*`).

## 8. Security & Privacy Checklist

- [ ] Per-user RLS on every new table; no `service_role` leaks to the client.
- [ ] Embeddings generated server-side only (never expose raw embeddings key).
- [ ] ffmpeg runs in sandboxed worker (Supabase Edge Function or isolated Vercel function with temp fs; never in main Edge runtime).
- [ ] YouTube/Piped calls egress-only; no inbound webhooks on our ingest pipeline.
- [ ] PII scrub: no user-identifying text is written into LLM prompts beyond the already-approved `channelMemory` profile.
- [ ] Cost/credit RPCs are SECURITY DEFINER with strict argument validation and `search_path = ''`.

---

## 9. Micro-Phases (Strict Execution Order)

> Each micro-phase is a single, self-contained, releasable increment ending with **typecheck → test → verify → conventional-commit → push** on `main`. Author always `RJrazz4 <admin@tubeclickpro.in>`.

### **Micro-Phase 1 — HEADROOM GHOST LAYER (Infra, invisible, all tiers)**
- Implement `packages/orchestrator/ai-gateway-headroom.ts` wrapping `gatewayChatJson`.
- Plumb into all existing call sites (`_agenticEngine.ts`, `api/generate-text.ts`, `api/clone-crush.ts` viral title generation).
- Extend `cost-tracker.ts` to log `tokensSaved` / `compressionRatio`.
- Add AdminPanel telemetry row.
- Add `tests/headroom.test.ts`.
- Verification + commit: `feat(infra): headroom ghost compression layer cuts token cost 40-60%`
- **Risk: lowest. Pure additive. No UI. No schema. Revert-safe via one boolean flag.**

### **Micro-Phase 2 — SERVER GHOST LEDGER (AuthZ foundations for the rest)**
- New Supabase migration `202608140001_ghost_intel_ledger.sql`: tables `ghost_memory_chunks`, `ghost_squad_briefs`, `ghost_recon_jobs`, `ghost_recon_frames`, `ghost_dawn_patrol`, and unified `consume_ghost_action(action, cost)` RPC with rolling-24h windows per action (matching Arc 2 pattern).
- Tier quotas matrix from §5 enforced server-side.
- Add `/api/ghost/credits.ts` (edge) returning `{interrogate, squad, recon, dawnPatrol}` for the active user; wire into `useQuotaStore`.
- Add `<GhostCreditBadge />`.
- Commit: `feat(ledger): ghost intel unified credit ledger with rolling-24h quotas`

### **Micro-Phase 3 — GHOST INTERROGATION (Feature A, PRO)**
- Backend: `/api/ghost/interrogate.ts` (streaming chat, transcript chunking, pgvector upsert, citation timestamps).
- Lazy-indexing on first message; idempotent upsert keyed on `(user_id, video_id, chunk_index)`.
- Store v6→v7 migration (interrogateSession field).
- Frontend: `<GhostInterrogationDrawer>` + chips on each conveyor tile.
- Hooks: `useGhostInterrogateMutation`.
- Soft-gate: free users → `/rewards?upsell=interrogate&tier=pro`.
- Tests: `tests/interrogate.test.ts`.
- Commit: `feat(interrogate): ghost interrogation — chat-with-competitor with timestamp citations`

### **Micro-Phase 4 — GHOST INTEL SQUAD (Feature B, PRO)**
- Extend `_agenticEngine.ts` with Scout/Crawler/Analyst/Comparator agents + Critic re-audit.
- Add `/api/ghost/squad-brief.ts` with credit debit first.
- Add helper `api/_youtube.ts :: fetchTopComments()` via Piped mesh with the same `firstValid` pattern.
- Frontend: `<GhostSquadDossier>` panel mounted on CloneCrush (replaces current plain result card, gated).
- Store: `activeDossier` field.
- Tests: `tests/squad-brief.test.ts`.
- Commit: `feat(squad): ghost intel squad — 4-agent competitor dossier with SWOT & attack vectors`

### **Micro-Phase 5 — GHOST VISUAL RECON (Feature D, BLACK-OPS)**
- Add Supabase Storage bucket `ghost-recon-frames` + policies.
- Worker: Supabase Edge Function `ghost-recon-worker` (ffmpeg → Gemini frame embed+caption).
- Routes: `/api/ghost/ingest-recon.ts`, `/api/ghost/frame-search.ts`.
- Frontend: `<GhostVisualRecon>` panel (text + image search modes, signed thumbnail URLs, jump-to-timestamp).
- Black-Ops gate check via `isBlackOpsTier` selector on authStore.
- Tests: `tests/recon.test.ts` (mocked Gemini, synthetic frames).
- Commit: `feat(recon): ghost visual recon — multimodal frame search across competitor DNA (black-ops)`

### **Micro-Phase 6 — DAWN PATROL (Feature E, PRO+)**
- Supabase `pg_cron` schedule + `pg_net` callout to `/api/ghost/dawn-patrol`.
- Route `/api/ghost/dawn-patrol.ts`: diff yesterday's brief → fresh conveyor data → 3-bullet brief → Resend email + in-app toast row.
- Frontend: `<DawnPatrolCard>` on Dashboard, Settings toggle + send-time preference.
- Store: `dawnPatrol` field + `markDawnPatrolRead`.
- Commit: `feat(dawn-patrol): always-on dawn patrol briefings at creator's sunrise`

### **Micro-Phase 7 — BUG STOMP & PERFORMANCE PASS**
- Bundle size audit (vite build analyzer).
- P95 latency pass against budgets in §6; tune Headroom aggressiveness.
- Final docs/README append (appendix section "Ghost Intel Modules", keeping README text-only enterprise grade).
- Commit: `chore(perf): ghost intel performance pass & docs`

---

## 10. Rollback Plan

Each micro-phase is isolated behind a feature flag on the server (env var `GHOST_<FEATURE>_ENABLED` default true, can be flipped per route to return `503 Ghost feature offline — falling back`). The Conveyor v6 surface, Ghost Cache, rolling-24h quotas, per-user storage, and all pre-Arc-3 features are **never touched** in a way that cannot be atomically reverted via single-revert commit.

---

## 11. Approval Gate

The blueprint is complete. **Requesting approval to execute Micro-Phase 1 (Headroom Ghost Layer) immediately**, which is low-risk, additive-only, and benefits every feature that follows by cutting token cost 40-60% before we spend a single extra LLM dollar on new features.

---

## 12. Progress Log

| Phase | Commit | Description | Status |
|---|---|---|---|
| 1 (Headroom) | `e8eed00` | SmartCrush + CacheAligner + RollingWindow wrapper on gatewayChatText/Json, /api/v1/metrics telemetry, 9 tests | ✅ shipped |
| 2 (Ledger) | `4ee8c4b` | `ghost_usage` table, `consume_ghost_action/get_ghost_quota` SECURITY DEFINER RPCs, /api/ghost/credits, useGhostCreditsStore + GhostCreditBadge, 8 tests | ✅ shipped |
| 3 (Interrogate) | `79e902e` | embeddings (text-embedding-3-small, 1536d), `ghost_memory_chunks` vector store + ivfflat, 4-agent index/chat RPCs, GhostInterrogationDrawer with [MM:SS] citations, 4 chunker tests | ✅ shipped |
| 4 (Squad) | `96d3fe3` | `ghost_squad_briefs` table + persist/get RPCs, 4-agent Scout/Crawler/Analyst/Comparator pipeline + Critic ≥85 gate with self-heal, Piped-mesh comment crawl, `/api/ghost/squad-brief` edge route, GhostSquadDossier panel with red THREAT LEVEL bar, 3 new tests | ✅ shipped |
| 5 (Visual Recon) | — | `ghost_recon_frames` table (vector(1536)) + upsert/search/count SECURITY DEFINER RPCs, multimodal `images` array on gatewayChatText/Json, 12-frame YouTube thumbnail-ladder sampler (no ffmpeg, Edge-safe), multimodal Flash captioning with batched text-embedding-3-small vectors, `/api/ghost/recon-ingest` + `/api/ghost/recon-search` edge routes, per-user useReconStore, GhostVisualRecon BLACK-OPS panel with clickable ?t= deep-links, 3 new tests | ✅ ready |
| 6 (Dawn Patrol) | — | — | ⏳ |
| 7 (Perf pass) | — | — | ⏳ |
