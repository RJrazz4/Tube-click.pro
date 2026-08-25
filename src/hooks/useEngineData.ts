import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { EngineError, engineFetch } from "@/lib/engine/client";
import type {
  AudienceBrief,
  AudienceProfile,
  ChallengeState,
  ConnectionStatus,
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
