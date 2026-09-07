import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { EngineError, engineFetch } from "@/lib/engine/client";
import type {
  AudienceBrief,
  AudienceProfile,
  ChallengeState,
  CompetitorGap,
  ConnectionStatus,
  DailyContentRecord,
  EngineScriptDetail,
  EngineScriptListItem,
} from "@/lib/engine/types";

/**
 * Engine data hooks (React Query v5). Query keys are namespaced under
 * ["engine", ...] so challenges/scripts/audience invalidate cleanly after
 * mutations — generating a script must immediately refresh the tracker.
 */

const Q = {
  connection: ["engine", "connection"] as const,
  audience: ["engine", "audience"] as const,
  challenge: ["engine", "challenge"] as const,
  scripts: ["engine", "scripts"] as const,
};

export function useEngineConnection(enabled: boolean) {
  return useQuery({
    queryKey: Q.connection,
    queryFn: () => engineFetch<ConnectionStatus>("/api/youtube/connection"),
    enabled,
    staleTime: 60_000,
    // Always refetch when this hook mounts (i.e. when the dashboard view that
    // shows the Connect/Connected card is entered). Connection status is the
    // one field that must NEVER be served from cache across an OAuth round
    // trip: the backend store is updated during the Google consent redirect,
    // and the app reloads on landing back with a stale cached "connected:
    // false" that this card would otherwise keep showing.
    refetchOnMount: "always",
    retry: (count, err) => !(err instanceof EngineError && err.status === 401) && count < 2,
  });
}

export function useAudienceProfile(enabled: boolean) {
  return useQuery({
    queryKey: Q.audience,
    queryFn: () => engineFetch<AudienceProfile>("/api/audience/profile"),
    enabled,
    staleTime: 5 * 60_000,
    retry: (count, err) =>
      !(err instanceof EngineError && [401, 404].includes(err.status)) && count < 2,
  });
}

export function useChallengeState(enabled: boolean) {
  return useQuery({
    queryKey: Q.challenge,
    queryFn: () => engineFetch<ChallengeState>("/api/challenge"),
    enabled,
    staleTime: 60_000,
  });
}

export function useEnrollChallenge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (timezone: string) =>
      engineFetch<ChallengeState>("/api/challenge/enroll", { method: "POST", body: { timezone } }),
    onSuccess: (state) => {
      toast.success("Challenge accepted", {
        description: "Day 1 starts now — your first Daily Action Script is waiting.",
      });
      void qc.invalidateQueries({ queryKey: Q.challenge });
      void state;
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useAbandonChallenge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => engineFetch<void>("/api/challenge", { method: "DELETE" }),
    onSuccess: () => {
      toast("Challenge paused — your history and badges are kept.");
      void qc.invalidateQueries({ queryKey: Q.challenge });
    },
  });
}

export function useEngineScripts(enabled: boolean) {
  return useQuery({
    queryKey: Q.scripts,
    queryFn: () => engineFetch<{ scripts: EngineScriptListItem[] }>("/api/scripts"),
    enabled,
    staleTime: 30_000,
  });
}

export function useEngineScriptDetail(id: string | null) {
  return useQuery({
    queryKey: ["engine", "script", id],
    queryFn: () => engineFetch<EngineScriptDetail>(`/api/scripts/${id}`),
    enabled: Boolean(id),
    staleTime: 60_000,
  });
}

/** Generate (free outline / premium package). 202 = queued; we poll the list. */
export function useGenerateScript() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (hungerTopic?: string) =>
      engineFetch<{ status: string; deliverable: string; quota: { used: number; limit: number } }>(
        "/api/scripts/generate",
        { method: "POST", body: hungerTopic ? { hungerTopic } : {} },
      ),
    onSuccess: (result) => {
      toast.success("Mission dispatched to the synthesis engine", {
        description: `${result.deliverable} • quota ${result.quota.used}/${result.quota.limit}/day`,
      });
      // Poll while the worker runs the pipeline.
      setTimeout(() => void qc.invalidateQueries({ queryKey: Q.scripts }), 4_000);
      setTimeout(() => {
        void qc.invalidateQueries({ queryKey: Q.scripts });
        void qc.invalidateQueries({ queryKey: Q.challenge });
      }, 12_000);
    },
    onError: (err: Error) => toast.error(err.message, { duration: 5_000 }),
  });
}

export function usePublishScript() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ scriptId, videoUrl }: { scriptId: string; videoUrl: string }) =>
      engineFetch<Record<string, unknown>>(`/api/scripts/${scriptId}/publish`, {
        method: "POST",
        body: { videoUrl },
      }),
    onSuccess: () => {
      toast.success("Published video linked ⭐", { description: "Double-credit day recorded. Measurement begins in 7 days." });
      void qc.invalidateQueries({ queryKey: Q.challenge });
      void qc.invalidateQueries({ queryKey: Q.scripts });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useScriptVoiceover() {
  return useMutation({
    mutationFn: async ({ scriptId, voiceAlias }: { scriptId: string; voiceAlias?: string }) => {
      const blob = await engineFetch<Blob>(`/api/scripts/${scriptId}/voiceover`, {
        method: "POST",
        body: voiceAlias ? { voiceAlias } : {},
        raw: true,
      });
      return blob;
    },
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "tubeclick-voiceover.mp3";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Voiceover generated", { description: "Neural voice MP3 downloaded." });
    },
    onError: (err: Error) => toast.error(err.message, { duration: 5_000 }),
  });
}

export function useAudienceBrief() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => engineFetch<{ brief: AudienceBrief; cached: boolean }>("/api/audience/brief", { method: "POST" }),
    onSuccess: (result) => {
      if (!result.cached) void qc.invalidateQueries({ queryKey: Q.audience });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ---------------------------------------------------------------------
// Connected Creator Hub — analytics for the user's OWN connected channel.
// Pulls the authenticated channel connection (identity + sync status) and
// the computed audience profile (real signal scores + geo share) from the
// backend engine's /api/youtube/connection and /api/audience/profile routes.
// Export types used by the Hub charts.
// ---------------------------------------------------------------------
export interface HubSeriesPoint {
  label: string;
  value: number;
}

export interface HubSignals {
  momentum: HubSeriesPoint[]; // signal momentum per hunger topic (real score)
  velocity: HubSeriesPoint[]; // engagement velocity per hunger topic (real score)
  geoShare: { name: string; value: number }[]; // audience pull by geography (real)
  topHungers: { topic: string; score: number; hook_retention?: number; watch_share_pct?: number }[];
}

export function useYouTubeHub(enabled: boolean) {
  return useQuery<HubSignals>({
    queryKey: Q.audience,
    queryFn: async () => {
      const profile = await engineFetch<AudienceProfile>("/api/audience/profile");
      const hungers = (profile.hungers ?? []).slice();
      // Real scores computed by the Audience Engine for this connected channel.
      const momentum = hungers.map((h) => ({
        label: h.topic.length > 16 ? `${h.topic.slice(0, 15)}…` : h.topic,
        value: Math.max(0, Math.min(100, Math.round(h.score))),
      }));
      const velocity = hungers.map((h) => ({
        label: h.topic.length > 16 ? `${h.topic.slice(0, 15)}…` : h.topic,
        value: Math.max(0, Math.min(100, Math.round(h.evidence?.hook_retention ?? h.score))),
      }));
      // Audience pull by geography — the engine attaches a real geo signal
      // (e.g. { India: 0.42, US: 0.18, ... }) to each hunger. Flatten the
      // strongest geos across all hungers into a share ranking.
      const geoCount = new Map<string, number>();
      for (const h of hungers) {
        const geo = h.geo ?? {};
        const entries = Object.entries(geo).filter(([, v]) => typeof v === "number") as [string, number][];
        if (entries.length) {
          const [country, weight] = entries.reduce<[string, number]>((max, e) =>
            (e[1]) > (max[1]) ? e : max, entries[0]);
          geoCount.set(country, (geoCount.get(country) ?? 0) + weight);
        }
      }
      const geoShare = [...geoCount.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([name, value]) => ({ name, value: Math.round(value * 100) }))
      const topHungers = hungers.map((h) => ({
        topic: h.topic,
        score: Math.max(0, Math.min(100, Math.round(h.score))),
        hook_retention: h.evidence?.hook_retention,
        watch_share_pct: h.evidence?.watch_share_pct,
      }));
      return { momentum, velocity, geoShare, topHungers };
    },
    enabled,
    staleTime: 5 * 60_000,
  });
}

// ---------------------------------------------------------------------
// Dual-LLM Daily Content Engine — one targeted package per day.
//   GET  /api/content/daily   today's package (Editor-approved)
//   POST /api/content/daily   trigger today's generation (queued)
// ---------------------------------------------------------------------
export function useDailyContent(enabled: boolean) {
  return useQuery({
    queryKey: ["engine", "daily-content"] as const,
    queryFn: () => engineFetch<DailyContentRecord>("/api/content/daily"),
    enabled,
    staleTime: 60_000,
    retry: (count, err) =>
      // 404 (not generated yet) is a real state — don't retry-spin.
      !(err instanceof EngineError && [401, 404, 503].includes(err.status)) && count < 2,
  });
}

export function useGenerateDailyContent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (competitorGap: CompetitorGap) =>
      engineFetch<{ status: string; jobId: string; date: string; cached?: boolean }>(
        "/api/content/daily",
        { method: "POST", body: { competitorGap } },
      ),
    onSuccess: (result) => {
      if (result.cached) {
        toast.success("Today's package is ready");
      } else {
        toast.success("Daily content engine dispatched", {
          description: "LLM Generator → Editor pipeline running. Tapping the dashboard again shortly.",
        });
      }
      // Poll after the dual-LLM pipeline has had time to run.
      setTimeout(() => void qc.invalidateQueries({ queryKey: ["engine", "daily-content"] }), 15_000);
      setTimeout(() => void qc.invalidateQueries({ queryKey: ["engine", "daily-content"] }), 40_000);
    },
    onError: (err: Error) => toast.error(err.message, { duration: 5_000 }),
  });
}

// Connection identity/sync status for the Hub header (name, handle, sync).
export { useEngineConnection as useYouTubeConnection };
