/**
 * src/stores/useGhostCreditsStore.ts — Ghost Intelligence credit store.
 *
 * Client mirror of the server-authoritative ghost_usage ledger (see
 * supabase/migrations/202608140001_ghost_intel_ledger.sql). State is
 * populated from GET /api/ghost/credits and refreshed:
 *   - On mount when the user is authenticated.
 *   - Every 30s while mounted (cheap, cached by edge).
 *   - Immediately after a successful consume (the consuming route
 *     returns the fresh post-consume verdict; we merge it).
 *   - On window focus.
 *
 * Per-user namespace: the store uses the same per-user localStorage
 * adapter that the auth store and clone-crush store use, so guest vs
 * user A vs user B never bleed. The persisted snapshot is a CACHE, not
 * a source of truth — the server's RPC verdict always overrides it,
 * exactly like useQuotaStore does for Chain-Loop.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { createPerUserStorage } from "@/lib/storage/perUserStorage";
import { useAuthStore } from "./useAuthStore";

export type GhostActionId = "interrogate" | "squad" | "recon" | "dawn_patrol";

export interface GhostActionCredits {
  used: number;
  limit: number;
  remaining: number;
  allowed: boolean;
  resetAt: string | null;
  remainingSeconds: number;
  totalRuns: number;
}

export interface GhostCreditsState {
  tier: "guest" | "free" | "pro";
  isBlackOps: boolean;
  actions: Record<GhostActionId, GhostActionCredits>;
  checkedAt: number;
  loading: boolean;
  error: string | null;

  /* Actions */
  hydrate: (snapshot: Partial<GhostCreditsState>) => void;
  setLoading: (v: boolean) => void;
  setError: (msg: string | null) => void;
  /** Merge a single post-consume verdict for one action. */
  applyConsume: (action: GhostActionId, verdict: GhostActionCredits & {
    tier?: "guest" | "free" | "pro"; isBlackOps?: boolean;
  }) => void;
  /** Tick remainingSeconds down by 1 per second. */
  tick: () => void;
  invalidate: () => void;
  reset: () => void;
}

const ZERO_ACTION: GhostActionCredits = {
  used: 0, limit: 0, remaining: 0, allowed: false,
  resetAt: null, remainingSeconds: 0, totalRuns: 0,
};

const DEFAULT_STATE = {
  tier: "guest" as const,
  isBlackOps: false,
  actions: {
    interrogate: { ...ZERO_ACTION },
    squad:       { ...ZERO_ACTION },
    recon:       { ...ZERO_ACTION },
    dawn_patrol: { ...ZERO_ACTION },
  },
  checkedAt: 0,
  loading: false,
  error: null,
};

export const useGhostCreditsStore = create<GhostCreditsState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_STATE,

      hydrate: (snapshot) => set((s) => ({
        ...s,
        ...snapshot,
        actions: snapshot.actions
          ? { ...s.actions, ...snapshot.actions }
          : s.actions,
        checkedAt: Date.now(),
        loading: false,
        error: null,
      })),

      setLoading: (loading) => set({ loading }),
      setError: (error) => set({ error, loading: false }),

      applyConsume: (action, verdict) => set((s) => ({
        ...s,
        tier: verdict.tier ?? s.tier,
        isBlackOps: verdict.isBlackOps ?? s.isBlackOps,
        actions: {
          ...s.actions,
          [action]: {
            used: verdict.used,
            limit: verdict.limit,
            remaining: verdict.remaining,
            allowed: verdict.allowed,
            resetAt: verdict.resetAt,
            remainingSeconds: verdict.remainingSeconds,
            totalRuns: verdict.totalRuns,
          },
        },
        checkedAt: Date.now(),
        error: null,
        loading: false,
      })),

      tick: () => {
        const s = get();
        let changed = false;
        const next = { ...s.actions };
        (Object.keys(next) as GhostActionId[]).forEach((k) => {
          const a = next[k];
          if (a.resetAt && a.remainingSeconds > 0) {
            next[k] = { ...a, remainingSeconds: Math.max(0, a.remainingSeconds - 1) };
            changed = true;
          }
        });
        if (changed) set({ actions: next });
      },

      invalidate: () => set({ checkedAt: 0 }),
      reset: () => set(DEFAULT_STATE),
    }),
    {
      name: "tubeclick:ghost-credits:v1",
      version: 1,
      storage: createJSONStorage(() => createPerUserStorage(
        "tubeclick:ghost-credits:v1",
        () => useAuthStore.getState().user?.id ?? null,
      )),
      partialize: (state) => ({
        tier: state.tier,
        isBlackOps: state.isBlackOps,
        actions: state.actions,
        checkedAt: state.checkedAt,
      }),
    },
  ),
);

/**
 * Selector helper: true if the user has enough credits to fire `action`
 * right now. Uses the in-memory cache; the server is always the final
 * authority when the request fires.
 */
export function canAffordGhostAction(
  state: Pick<GhostCreditsState, "tier" | "actions">,
  action: GhostActionId,
): boolean {
  if (state.tier === "guest") return false;
  return state.actions[action]?.allowed === true;
}
