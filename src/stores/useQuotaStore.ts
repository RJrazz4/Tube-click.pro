/**
 * Daily Clone & Crush quota store.
 *
 * The only authoritative answer lives in the database (daily_usage table,
 * enforced on /api/clone-crush before any LLM work runs). This store is a
 * short-lived client mirror used by the UI to render lock-state and a
 * live countdown without hammering the server on every click.
 *
 * The server response on `action=rewrite` is the source of truth: if it
 * returns code=DAILY_LIMIT we trust it immediately and overwrite local
 * state, regardless of what the cache said.
 */
import { create } from "zustand";

export interface QuotaState {
  allowed: boolean;
  tier: "free" | "pro";
  usedToday: number;
  limit: number | null;      // null = unlimited (pro)
  remaining: number | null;
  resetAt: string | null;    // ISO timestamp
  remainingSeconds: number;
  checkedAt: number;         // epoch ms
  loading: boolean;
  error: string | null;

  setQuota: (q: Partial<QuotaState>) => void;
  setLoading: (loading: boolean) => void;
  setError: (err: string | null) => void;
  tick: () => void;          // decrement remainingSeconds by 1
  reset: () => void;
}

const DEFAULT_STATE = {
  allowed: true,
  tier: "free" as const,
  usedToday: 0,
  limit: 1,
  remaining: 1,
  resetAt: null,
  remainingSeconds: 0,
  checkedAt: 0,
  loading: false,
  error: null,
};

export const useQuotaStore = create<QuotaState>((set, get) => ({
  ...DEFAULT_STATE,
  setQuota: (q) => set((s) => ({ ...s, ...q, checkedAt: Date.now(), error: null, loading: false })),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error, loading: false }),
  tick: () => {
    const s = get();
    if (s.resetAt && s.remainingSeconds > 0) {
      set({ remainingSeconds: Math.max(0, s.remainingSeconds - 1) });
    } else if (s.resetAt && s.remainingSeconds <= 0) {
      // Rollover — force a refresh on next interaction by invalidating cache.
      set({ checkedAt: 0 });
    }
  },
  reset: () => set(DEFAULT_STATE),
}));
