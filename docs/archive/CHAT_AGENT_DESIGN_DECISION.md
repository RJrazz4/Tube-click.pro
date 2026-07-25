# Design Decision — Chat Agent Routing & Chain-Loop Handoff

**Status:** Implemented on `main`.
**Date:** 2026-07
**Summary:** Unifies the TubeBot chat path onto Vercel Edge + OpenRouter with per-attempt timeouts and model failover, and wires Clone & Crush's Chain-Loop output into TubeBot as a first-class handoff destination.

---

## Context

At the time of this work, the codebase contained **three parallel AI text-generation stacks**, and the `/chat-agent` route was silently pinned to the wrong one by default:

| Stack | Location | Keys consumed | Rotation | Timeout | On `/chat-agent`? |
|---|---|---|---|---|---|
| A — Vercel Edge | `api/generate-text.ts` + `api/_shared.ts` | `OPENROUTER_API_KEYS` (plural form only) | Custom loop | **None** (`fetch` had no `AbortSignal`) | Only when `VITE_USE_VERCEL_EDGE=true` or `VITE_API_MODE=vercel` |
| B — Supabase Edge | `supabase/functions/generate-content/index.ts` | `GEMINI_API_KEY` (single key, no OpenRouter) | None | None | **Default path** |
| C — Orchestrator | `packages/orchestrator/manager/openrouter-client.ts` + `keys/key-pool.ts` | `OPENROUTER_API_KEYS` | `KeyPool` — round-robin, cooldown, exhaustion, health | Per-attempt `AbortController` + retry budget | No — wired only for `apps/api` storyboard/thumbnail |

Because `.env.example` shipped with `VITE_USE_VERCEL_EDGE=false` and `VITE_API_MODE=supabase`, chat was defaulting to Stack B, which never touched the OpenRouter key pool, and the Supabase function was pinned to a retired Gemini model. The stack-A rotation loop had no per-attempt timeout, so slow upstreams regularly ran past Vercel Edge limits, producing dropped TCP connections that the client surfaced as a transport error ("Ghost tunnel interference").

Separately, the Clone & Crush Chain-Loop workflow already handed off to Voiceover Studio and the Repurposer via `useWorkflowStore`, but TubeBot was not a destination, and `ChatAgent.tsx` did not read from the workflow store at all.

## Resolution

1. **Unified the chat text path to Vercel Edge → `packages/orchestrator`.**
   - `api/_ai.ts` replaces the hand-rolled rotation in `_shared.ts` for chat; it delegates to the orchestrator's `OpenRouterClient`, which has a proper `KeyPool` (round-robin, cooldown, exhaustion, health), per-attempt `AbortController`, and a wall-clock deadline.
   - Key resolution accepts `OPENROUTER_API_KEYS` (comma-separated), `OPENROUTER_API_KEY` (legacy singular), and `OPENROUTER_API_KEY_1..N` (numbered form) so misconfiguration is not silently fatal.
   - Boot log records key count (masked) and model chain to make misrouting obvious.
2. **Bounded timeouts end to end.**
   - Server: per-attempt timeout (`OPENROUTER_CHAT_ATTEMPT_TIMEOUT_MS`, default 7s) and a global deadline; fetch wall-clock time is counted against the retry budget.
   - `vercel.json` is left on platform defaults; the client timeout for chat is set to sit just under the platform limit so users get a typed `TIMEOUT` rather than a dropped connection.
3. **Chain-Loop → TubeBot handoff.**
   - `WorkflowDestination` extended with `"tubebot"`.
   - Clone & Crush gained a "Send to TubeBot" control next to the existing Voiceover/Repurposer handoffs.
   - `ChatAgent.tsx` reads `useWorkflowStore` on mount and prefills topic/context from the active content package, matching the existing Repurposer and Voice Studio pattern.
4. **Observability.**
   - Structured logs per attempt: key index (masked), model, HTTP status, error code, attempt latency, and whether failover fired. No key material is ever logged.
   - `/api/v1/metrics` exposes rotation and provider health.

## Target Architecture (post-change)

```
/chat-agent  ──►  /api/generate-text (Vercel Edge, pinned)
                       │
                       ▼
            OpenRouterClient (packages/orchestrator)
                       │  KeyPool: round-robin + cooldown + exhaustion
                       │  per-attempt AbortController + deadline
                       ▼
                 OpenRouter (multi-key, model fallbacks)
                       │
                       ▼
            typed OpenRouterError → normalized codes
                       │
            client receives clean JSON or typed TIMEOUT/429
            (never a dropped socket)

Chain-Loop (CloneCrush) ──handoff──► TubeBot (ChatAgent)
   via useWorkflowStore.contentPackage + niche
   (same pattern as Voiceover/Repurposer)
```

## Resulting Conventions

- **One text stack.** Chat, SEO, storyboard planning, and Clone & Crush all route through the orchestrator. Per-route helper functions in `api/` remain thin entry points.
- **Keys are normalized.** Any of the three documented env forms works; missing keys fail loudly at boot.
- **Timeouts are enforced at every hop.** Hung upstreams cannot hang the function.
- **Handoffs are declarative via `useWorkflowStore`.** New destinations follow the existing pattern.

## References

- Implementation: `api/_ai.ts`, `api/generate-text.ts`, `src/api/client/secureClient.ts`, `src/stores/useWorkflowStore.ts`, `src/pages/CloneCrush.tsx`, `src/pages/ChatAgent.tsx`.
- Tests: `tests/chat-ai.test.ts`, orchestrator key/conformance/OpenRouter client tests.
- Environment: `OPENROUTER_API_KEYS`, `OPENROUTER_CHAT_ATTEMPT_TIMEOUT_MS` (see `docs/ENVIRONMENT.md`).
