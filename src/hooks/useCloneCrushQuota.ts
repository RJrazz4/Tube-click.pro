/**
 * useCloneCrushQuota
 *
 * Subscribes to the client mirror of daily usage and exposes { quota, refresh, isBlocked }.
 * Ticks remainingSeconds every second so the countdown in the overlay stays live.
 *
 * Server is always authoritative: on any action=rewrite response with code=DAILY_LIMIT,
 * the call site must push the server decision into the store via setQuota.
 */
import { useEffect, useCallback } from "react";
import { useQuotaStore } from "@/stores/useQuotaStore";
import { fetchCloneCrushQuota } from "@/api/client/secureClient";
import { useAuthStore } from "@/stores/useAuthStore";

const CACHE_MS = 30_000; // refetch at most every 30s while mounted
const TICK_MS = 1_000;

export function useCloneCrushQuota() {
  const quota = useQuotaStore();
  const tier = useAuthStore((s) => s.license.tier);

  const refresh = useCallback(async (force = false) => {
    const s = useQuotaStore.getState();
    if (!force && Date.now() - s.checkedAt < CACHE_MS && !s.error) return;
    useQuotaStore.getState().setLoading(true);
    try {
      const data = await fetchCloneCrushQuota();
      useQuotaStore.getState().setQuota({
        allowed: !!data.allowed,
        tier: data.tier === "pro" ? "pro" : "free",
        usedToday: typeof data.usedToday === "number" ? data.usedToday : 0,
        limit: data.limit === null ? null : (typeof data.limit === "number" ? data.limit : 1),
        remaining: data.remaining === null ? null : (typeof data.remaining === "number" ? data.remaining : (data.allowed ? 1 : 0)),
        resetAt: typeof data.resetAt === "string" ? data.resetAt : null,
        remainingSeconds: typeof data.remainingSeconds === "number" ? data.remainingSeconds : 0,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not refresh quota";
      useQuotaStore.getState().setError(msg);
    }
  }, []);

  // Initial fetch + tick loop.
  useEffect(() => {
    if (tier === "pro") {
      useQuotaStore.getState().setQuota({
        allowed: true, tier: "pro", usedToday: 0, limit: null,
        remaining: null, resetAt: null, remainingSeconds: 0,
      });
      return;
    }
    void refresh(true);
    const tickId = window.setInterval(() => useQuotaStore.getState().tick(), TICK_MS);
    const refreshId = window.setInterval(() => void refresh(false), CACHE_MS);
    return () => {
      window.clearInterval(tickId);
      window.clearInterval(refreshId);
    };
  }, [refresh, tier]);

  return {
    quota,
    refresh,
    // Helper for quick gates: free user who is out of runs.
    isBlocked: tier !== "pro" && !quota.allowed && quota.remainingSeconds > 0,
  };
}
