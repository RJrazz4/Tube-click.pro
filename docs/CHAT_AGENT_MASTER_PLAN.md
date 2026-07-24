# Master Plan — Fix `/chat-agent` ("Ghost tunnel interference") + Automate Chain-Loop → TubeBot Flow

**Author:** CTO / Architecture review
**Status:** ANALYSIS ONLY — no code written yet. Awaiting your approval before execution.
**Branch:** `arena/019f94cc-tube-click-pro`

---

## 0. TL;DR (read this first)

There are **two separate, disconnected AI text stacks** in this repo, and `/chat-agent` is silently routed to the **wrong one** by default. Your "3 OpenRouter keys" are almost certainly **not even on the live chat path** — that alone explains why "the fallback/rotation logic is clearly failing." The "Ghost tunnel interference" string is a **client-side transport error** that fires when the connection to the API is dropped (platform timeout / hung upstream / CORS), which the current server code makes very likely because it has **no per-request timeout** on the OpenRouter fetch.

Separately, the "Chain-Loop → TubeBot" disconnect is real and structural: the workflow store already carries the data and already handoffs to Voiceover + Repurposer, but **TubeBot was simply never added as a handoff destination**, and `ChatAgent.tsx` reads **no shared state** at all.

Both issues are fixable without re-architecting the product. Details below.

---

## 1. Current System Map (as it actually runs today)

### 1.1 Two parallel AI text stacks

| Stack | Where | Keys it reads | Rotation? | Timeout? | Used by `/chat-agent`? |
|---|---|---|---|---|---|
| **A — Vercel Edge** | `api/generate-text.ts` + `api/_shared.ts` | `OPENROUTER_API_KEYS` (plural **only**) | Yes (custom loop) | **No** (no `signal` on `fetch`) | Only if `VITE_USE_VERCEL_EDGE=true` **or** `VITE_API_MODE=vercel` |
| **B — Supabase Edge (Deno)** | `supabase/functions/generate-content/index.ts` | `GEMINI_API_KEY` / `GOOGLE_AI_API_KEY` (single, **no OpenRouter**) | **None** | No | **YES, by default** |
| **C — Orchestrator (robust, unused by chat)** | `packages/orchestrator/manager/openrouter-client.ts` + `keys/key-pool.ts` | `OPENROUTER_API_KEYS` | Yes (real `KeyPool`: round-robin + cooldown + exhaustion + health) | **Yes** (`AbortController` per attempt + retry budget) | **No** — used only by `apps/api` storyboard/thumbnail routes |

**The smoking gun:** `.env.example` ships `VITE_USE_VERCEL_EDGE=false` and `VITE_API_MODE=supabase` as defaults. Under those defaults, `/chat-agent` → Stack **B** (Supabase Gemini), which **never reads your OpenRouter keys at all** and hardcodes `gemini-2.0-flash` — a model the repo's own comments flag as retired/dead. So in the default config, your rotation logic literally cannot fail, because **it never runs**.

### 1.2 The client routing decision (single source of the route ambiguity)

`src/api/client/secureClient.ts` → `getApiEndpoint("generate-content")`:

```
useVercelEdge = (functionName === "clone-crush" || "transcript")
              || VITE_USE_VERCEL_EDGE === "true"
              || VITE_API_MODE === "vercel"
```

- `clone-crush` and `transcript` are **hard-pinned to Vercel**.
- `generate-content` (TubeBot) follows the env flag → defaults to **Supabase**.

Route map (same file): `"generate-content" → "/api/generate-text"`.

### 1.3 What "Ghost tunnel interference" actually is

`src/api/client/secureClient.ts:299` — it is the **`isNet && !aborted`** branch, i.e. a transport-level failure (`TypeError: Failed to fetch`, dropped connection, DNS/reset). Because that string is "clean" text, `friendlyError.ts` passes it straight to the UI under the title "Connection issue." It is **not** an API-key error and **not** a model error — it is "the browser couldn't complete the HTTP exchange with our own backend."

---

## 2. Root-Cause Analysis — Issue 1: API failures on `/chat-agent`

Ranked by likelihood of being THE primary cause you're seeing.

### RC-1 (Critical) — Wrong stack on the default route; OpenRouter keys bypassed
- Default env (`VITE_API_MODE=supabase`) sends chat to the Supabase function that uses **one Gemini key** and a **retired model**.
- If `GEMINI_API_KEY` is missing → 500 "not configured." If present but the model is dead/exhausted → repeated 4xx/429 → the client retries 3× then surfaces an error.
- Your 3 OpenRouter keys are configured but **sit unused** for this path.
- **This is the most probable reason "fallback/rotation is clearly failing."**

### RC-2 (Critical) — No per-attempt timeout in the Vercel rotation loop
- `api/_shared.ts` → `fetchOpenRouterWithRetry()` calls `fetch(OPENROUTER_URL, …)` with **no `AbortSignal`**.
- One slow/hung upstream request blocks the whole loop. Total wall-clock is **unbounded** because only `sleep`s are counted against `AI_RETRY_BUDGET_MS`, not `fetch` durations.
- With 3 keys × 2 models × 2 attempts, the function regularly blows past Vercel Edge `maxDuration`.
- `vercel.json` has **no `functions`/`maxDuration` override** → platform default kills the connection → browser sees a dropped socket → **`TypeError: Failed to fetch` → "Ghost tunnel interference."**
- (Note: when this same hang happens on Stack B, the Supabase gateway cold-start + Gemini stall produces the same dropped-connection symptom.)

### RC-3 (High) — Client timeout window doesn't match platform reality
- `requestTimeoutMs("generate-content")` returns **45s** (default branch).
- The server dies at ~10–25s (Vercel Edge) well before 45s, so the failure is reported as a **network drop**, not the cleaner "Request timed out" — which is why you see the scary "tunnel interference" wording instead of a calm timeout card.

### RC-4 (Medium-High) — Env-var shape mismatch silently disables rotation
- `api/_shared.ts` → `openRouterKeys()` reads **only** `OPENROUTER_API_KEYS` (plural).
- `packages/shared/env` (and `.env.example`) also document `OPENROUTER_API_KEY` (singular) as a valid legacy alias. If keys were set as the singular var — or, very commonly, as `OPENROUTER_API_KEY_1/2/3` — `openRouterKeys()` throws "not configured," turning every Vercel request into a 500 **before** rotation runs.
- Edge runtime is stateless, so any per-key cooldown/circuit-breaker can't persist between requests without external storage (affects the orchestrator's `KeyPool` too).

### RC-5 (Systemic) — Two redundant stacks; the robust one isn't wired to chat
- Stack C (`packages/orchestrator`) already implements everything we need: `KeyPool` (round-robin, cooldown, exhaustion, redacted health snapshot), per-attempt `AbortController` timeout, retry budget, typed `OpenRouterError` kinds, and model defaulting.
- It is consumed only by `apps/api` (storyboard/thumbnail). Chat text generation ignores it and uses the hand-rolled `_shared.ts` loop (Stack A) or the single-key Gemini function (Stack B).
- Net effect: the best-engineered code in the repo is not on the path that's failing.

**Conclusion on Issue 1:** The failures are **not** because the rotation algorithm is wrong — it's because (a) the rotation code isn't on the live chat route, (b) even when it is, a missing timeout turns slow upstreams into dropped connections that get mislabeled, and (c) env shape/defaults make it trivial to misconfigure. The fix is to **unify onto one OpenRouter path with timeouts and normalized env**, not to keep patching two paths.

---

## 3. Root-Cause Analysis — Issue 2: Chain-Loop Configurator → TubeBot disconnect

### RC-U1 — TubeBot is not a workflow destination
- `useWorkflowStore.ts`: `WorkflowDestination = "voice" | "repurposer"`. TubeBot is absent.
- `CloneCrush.tsx` defines `handleSendToVoiceover` (L244) and `handleSendToRepurposer` (L245), both calling `startWorkflowHandoff(...)`. **There is no `handleSendToTubeBot`.**
- The data **is** being produced: `CloneCrush.tsx:226` calls `saveContentPackage({ rewriteId, title, fullScript, thumbnailPrompt, seoTags })`, so `activeWorkflow.contentPackage` is populated. The plumbing exists for Voiceover/Repurposer — TubeBot was simply never added.

### RC-U2 — `ChatAgent.tsx` reads no shared state
- `topic = useState("")`, and `platform/style/language` are local defaults.
- Imports: it pulls in `useNavigate`, `useSoftGate`, `fetchEdgeFunctionJson`, `friendlyError`, `stats` — but **not** `useWorkflowStore` or `useCloneCrushStore`.
- By contrast, `Repurposer.tsx` (L35–51) and `VoiceStudio.tsx` (L48–96) both read `useWorkflowStore` and prefill their inputs on mount via a `useEffect` keyed on `activeWorkflow.id`. TubeBot is the **only** creator-tool destination that doesn't.

### RC-U3 — Schema mismatch needs a deliberate adapter
- ChatAgent expects free-text `topic` → outputs `{titles, hooks, script, hashtags, description}`.
- Chain-Loop produces `{rewrittenTitle, glitchHook, fullScript, seoTags, thumbnailPrompt, editingGuide, niche}` (+ `activeWorkflow.niche`, `competitor`).
- Wiring the store isn't enough; we need an explicit mapping (e.g., `topic ← niche || rewrittenTitle`, optional seed of a "refine this script" context, optional competitor URL).

**Conclusion on Issue 2:** This is a straightforward, low-risk extension of the existing, working handoff pattern — add TubeBot as a destination, add a "Send to TubeBot" control, and make `ChatAgent` consume `useWorkflowStore` exactly like Repurposer/VoiceStudio already do.

---

## 4. Master Plan — Step-by-Step

Phased so each phase is independently shippable and independently testable. I will not start Phase 1 until you approve.

### Phase 0 — Verify the actual runtime config (no code; diagnostic only)
**Goal:** Confirm which stack is live so we fix the *real* cause, not a guess.
- Check deployed env: `VITE_API_MODE`, `VITE_USE_VERCEL_EDGE`, and (server-side) `OPENROUTER_API_KEYS` vs `OPENROUTER_API_KEY`/numbered variants, plus `GEMINI_API_KEY`.
- Pull the Vercel/Supabase function logs for one failing `/chat-agent` call to capture the HTTP code + which function answered.
**Outcome:** Decides whether the primary fix is "repoint route" (RC-1) or "harden the Vercel path" (RC-2/RC-4) or both.

### Phase 1 — Make OpenRouter the single, authoritative chat path (fixes RC-1, RC-4)
**Goal:** One code path for chat text; your 3 keys always used.
- Normalize key resolution: accept `OPENROUTER_API_KEYS`, `OPENROUTER_API_KEY`, and `OPENROUTER_API_KEY_1..N` in one helper (reuse `packages/shared/env` semantics).
- Decide the canonical route. Recommended: pin `generate-content` to Vercel `/api/generate-text` (same pattern already used for `clone-crush`/`transcript`) so OpenRouter + rotation is guaranteed, OR upgrade the Supabase function to call OpenRouter. **Recommendation: Vercel pin** (lowest risk, matches existing Clone-Crush precedent).
- Add a boot-time self-check that logs `openrouterKeys.length` (masked) so a missing-key misconfiguration is obvious in logs instead of silent.
**Files (likely):** `src/api/client/secureClient.ts` (route map + `getApiEndpoint`), `api/_shared.ts` (`openRouterKeys` normalization), `api/config.ts` (expose masked key count for an admin view).
**Risk:** Changing client routing touches every AI call site — mitigate by keeping the Supabase path as an explicit fallback behind a flag, not deleting it.

### Phase 2 — Add hard timeouts + bounded budget on the server (fixes RC-2, RC-3)
**Goal:** A slow/hung upstream can never again drop the connection; the client always gets a clean response.
- Add an `AbortController` + per-attempt `timeoutMs` to every upstream `fetch` inside `fetchOpenRouterWithRetry` (mirror `OpenRouterClient.attempt()`).
- Count **fetch wall-time** against `AI_RETRY_BUDGET_MS`, not just sleeps; cap total attempts.
- Add `maxDuration` to `vercel.json` explicitly so the platform limit is intentional, not accidental.
- Lower the client `requestTimeoutMs("generate-content")` to sit *just under* the server maxDuration (e.g., server 25s → client 22s) so the client never outlives the server and always gets a typed `TIMEOUT` instead of a network drop.
**Files (likely):** `api/_shared.ts`, `src/api/client/secureClient.ts`, `vercel.json`.

### Phase 3 — Replace the hand-rolled loop with the orchestrator client (fixes RC-5, long-term)
**Goal:** One battle-tested rotation implementation across the product.
- Wire `api/generate-text.ts` to use `packages/orchestrator`'s `OpenRouterClient` (+ `KeyPool`) instead of `_shared.ts`'s `fetchOpenRouterWithRetry`. This brings round-robin, cooldown, exhaustion, health snapshots, and typed errors for free.
- Map `OpenRouterError` kinds → the existing normalized codes so `friendlyError.ts` and the retry button keep working unchanged.
- Keep `_shared.ts` helpers that other functions import (`corsHeaders`, `parseProviderError`, etc.); only swap the fetch strategy.
**Files (likely):** `api/generate-text.ts`, `packages/orchestrator` (tsconfig/build so an edge function can import it), `api/_shared.ts` (deprecate `fetchOpenRouterWithRetry`).
**Risk:** Importing an orchestrator package into a Vercel Edge function needs a build/bundling check (Edge runtime constraints). If that's heavy, fall back to Phase 2-only (port the timeout/cooldown *into* `_shared.ts`). This is the one phase I'd want your call on.

### Phase 4 — Automate Chain-Loop → TubeBot (fixes Issue 2: RC-U1/U2/U3)
**Goal:** A finished Chain-Loop handoffs into TubeBot with zero retyping, exactly like Voiceover/Repurposer.
1. Extend `WorkflowDestination` to include `"tubebot"` in `useWorkflowStore.ts`.
2. Add `handleSendToTubeBot` in `CloneCrush.tsx` (mirror L244/245): `startWorkflowHandoff("tubebot")` → `navigate("/chat-agent")`. Add the UI control in the "Chain-Loop Complete: 5 Assets" card (L435 area) next to the existing handoffs.
3. Make `ChatAgent.tsx` consume `useWorkflowStore` on mount (mirror `Repurposer.tsx` L35–51): if `activeWorkflow.contentPackage`/`niche` exists, prefill `topic` (from `niche || contentPackage.title`) and, optionally, seed the chat with a "Refine this Chain-Loop script" context message. Clear the handoff once consumed.
4. Schema adapter: map Chain-Loop fields → TubeBot seed (topic + optional context block referencing `rewrittenTitle`/`fullScript`/`seoTags`), so the AI gets real context, not just a topic string.
**Files (likely):** `src/stores/useWorkflowStore.ts`, `src/pages/CloneCrush.tsx`, `src/pages/ChatAgent.tsx` (maybe a small `src/lib/workflow/chainLoopSeed.ts` mapper).

### Phase 5 — Observability + tests (locks the fixes in)
- Server: structured logs per attempt — `{ keyIndex, model, httpStatus, code, attemptMs, rotated }` (no key material). Surface masked key health via `/api/config` (admin only).
- Tests: extend `tests/` to cover (a) key rotation across 429/402/401, (b) per-attempt timeout aborting a hung upstream, (c) route resolution for `generate-content`, (d) Chain-Loop→TubeBot prefill (store + ChatAgent mount effect).
- Keep the repo green: `npm run typecheck`, `npm test`, `npm run build`. Lint is pre-existing-broken repo-wide (see note below) — I'll keep touched files lint-clean but won't claim a repo-wide lint pass.

---

## 5. Target Architecture (the "north star")

```
/chat-agent  ──►  /api/generate-text (Vercel Edge, pinned)
                       │
                       ▼
            OpenRouterClient (packages/orchestrator)
                       │  KeyPool: round-robin + cooldown + exhaustion
                       │  per-attempt AbortController timeout
                       │  retry budget (fetch wall-time counted)
                       ▼
                 OpenRouter (3 keys, model chain)
                       │
                       ▼
            typed OpenRouterError → normalized codes
                       │
            client gets clean JSON or typed TIMEOUT/429 (never a drop)

Chain-Loop (CloneCrush) ──handoff──► TubeBot (ChatAgent)
   via useWorkflowStore.contentPackage + niche
   (same proven pattern as Voiceover/Repurposer)
```

Principles: **one text stack**, **keys always normalized & on-path**, **timeouts at every hop**, **handoffs are declarative via the workflow store**.

---

## 6. Decisions I need from you before executing

1. **Canonical route for chat:** pin `generate-content` to Vercel/OpenRouter (my recommendation), or upgrade the Supabase function to OpenRouter instead?
2. **Phase 3 scope:** wire the real orchestrator `OpenRouterClient` into the edge function (cleaner, more work), or port its guarantees (timeout/cooldown) into `_shared.ts` (faster, less churn)? This is the main cost/risk lever.
3. **TubeBot prefill behavior:** auto-run generation on arrival, or prefill + let the user hit Send? (I lean prefill + Send, to keep user in control.)
4. **Timeout budget:** I propose server maxDuration 25s / client 22s for `generate-content`. OK, or do you want it tighter/looser?

---

## 7. Housekeeping note (heads-up, not part of the ask)

The working tree currently has **6 uncommitted modified files** from a prior session (`api/clone-crush.ts`, `api/transcript.ts`, `src/api/client/secureClient.ts`, `src/pages/CloneCrush.tsx`, `src/stores/useCloneCrushStore.ts`, `tests/clone-crush.test.ts` — the viral-threshold + transcript-timeout work). `git log` HEAD is `014476d` (PR #32 merge); those changes are **not** committed. They don't conflict with this plan, but we should decide whether to commit/PR them separately before or alongside this work so nothing is accidentally deployed or lost. Flagging only — no action taken.

---

## 8. What I will NOT do

- No code edits, no commits, no pushes until you approve the plan and the Phase-1/2/3/4 scope.
- No guessing on env secrets — Phase 0 verification is diagnostic only and relies on what you can share from deployed env/logs (I'll never ask for key values).
