/**
 * src/hooks/useGhostCredits.ts
 *
 * Subscribes to the Ghost Credits store, refreshes from /api/ghost/credits
 * on mount / interval / focus, and exposes {credits, refresh, isActionBlocked}.
 *
 * Mirrors useCloneCrushQuota's contract (client mirror, server authoritative).
 */
import { useCallback, useEffect } from "react";
import { useGhostCreditsStore, type GhostActionId } from "@/stores/useGhostCreditsStore";
import { useAuthStore, isProTier } from "@/stores/useAuthStore";

const CACHE_MS = 30_000;
const TICK_MS = 1_000;

interface GhostCreditsApiResponse {
  allowed: boolean;
  code: string;
  tier: "guest" | "free" | "pro";
  is_black_ops: boolean;
  actions: Record<GhostActionId, {
    used: number;
    limit: number;
    remaining: number;
    allowed: boolean;
    reset_at: string | null;
    remaining_seconds: number;
    total_runs: number;
  }>;
}

async function fetchGhostCredits(): Promise<GhostCreditsApiResponse> {
  const res = await fetch("/api/ghost/credits", {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Ghost credits HTTP ${res.status}`);
  return res.json() as Promise<GhostCreditsApiResponse>;
}

export function useGhostCredits() {
  const credits = useGhostCreditsStore();
  const license = useAuthStore((s) => s.license);
  const isAuthed = useAuthStore((s) => s.isAuthenticated);

  const refresh = useCallback(async (force = false) => {
    const s = useGhostCreditsStore.getState();
    if (!force && Date.now() - s.checkedAt < CACHE_MS && !s.error) return;
    useGhostCreditsStore.getState().setLoading(true);
    try {
      const data = await fetchGhostCredits();
      const normalized: Record<GhostActionId, ReturnType<typeof useGhostCreditsStore.getState>["actions"][GhostActionId]> = {
        interrogate: ZERO(),
        squad: ZERO(),
        recon: ZERO(),
        dawn_patrol: ZERO(),
      };
      (Object.keys(data.actions || {}) as GhostActionId[]).forEach((k) => {
        const a = data.actions[k];
        normalized[k] = {
          used: a.used,
          limit: a.limit,
          remaining: a.remaining,
          allowed: a.allowed,
          resetAt: a.reset_at,
          remainingSeconds: a.remaining_seconds,
          totalRuns: a.total_runs,
        };
      });
      useGhostCreditsStore.getState().hydrate({
        tier: data.tier,
        isBlackOps: data.is_black_ops,
        actions: normalized,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not refresh Ghost credits";
      useGhostCreditsStore.getState().setError(msg);
    }
  }, []);

  useEffect(() => {
    // When the user is not authed, we force the guest/zero state so the
    // UI renders locked chips instead of stale values from a prior login.
    if (!isAuthed) {
      useGhostCreditsStore.getState().reset();
      return;
    }
    // Pro status affects cap selection — when the license is Pro but
    // we haven't yet refreshed, still render optimistic "allowed: true"
    // where the store says limit=0 (we'll correct on first refresh).
    void refresh(true);
    const tickId = window.setInterval(() => useGhostCreditsStore.getState().tick(), TICK_MS);
    const refetchId = window.setInterval(() => void refresh(false), CACHE_MS);
    const onVisibility = () => { if (document.visibilityState === "visible") void refresh(false); };
    window.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(tickId);
      window.clearInterval(refetchId);
      window.removeEventListener("visibilitychange", onVisibility);
    };
  }, [isAuthed, refresh]);

  // Silence unused-var warning when not using license directly; kept for future.
  void license;

  return {
    credits,
    refresh,
    isActionBlocked: (action: GhostActionId) => {
      const a = credits.actions[action];
      return credits.tier === "free" || !a.allowed;
    },
    isPro: isProTier(license),
  };
}

function ZERO() {
  return {
    used: 0, limit: 0, remaining: 0, allowed: false,
    resetAt: null, remainingSeconds: 0, totalRuns: 0,
  };
}
