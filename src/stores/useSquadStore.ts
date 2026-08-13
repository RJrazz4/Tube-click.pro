/**
 * src/stores/useSquadStore.ts
 *
 * Per-user (namespaced via createPerUserStorage) zustand store for the
 * Ghost Intel Squad dossier panel. Caches briefs keyed by videoId so
 * repeat clicks don't re-hit the network or burn extra credits.
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createPerUserStorage } from "@/lib/storage/perUserStorage";
import { useAuthStore } from "./useAuthStore";

export interface SquadAttackVector {
  title: string;
  tactic: string;
  expectedLift: string;
}
export interface SquadBrief {
  videoId: string;
  scout?: {
    title?: string;
    channelName?: string;
    views?: string;
    viewsCount?: number;
    velocityScore?: number;
    estimatedRevenue?: string;
    niche?: string;
    summary?: string;
    signals?: string[];
  };
  crawler?: {
    transcriptPreview?: string;
    transcriptSource?: string;
    transcriptTruncated?: boolean;
    topSentiment?: string;
    keyPhrases?: string[];
    comments?: Array<{ author: string; text: string; likeCount: number }>;
  };
  analyst?: {
    hookArchitecture?: string;
    retentionLoopMap?: string[];
    monetizationSignals?: string[];
    weaknessGaps?: string[];
    ctaArchitecture?: string;
    pacingAssessment?: string;
  };
  comparator?: {
    strengths?: string[];
    weaknesses?: string[];
    opportunities?: string[];
    threats?: string[];
    attackVectors?: SquadAttackVector[];
    differentiatorAngle?: string;
  };
  threatLevel?: number;
  criticAudit?: { score?: number; critique?: string; iterations?: number; selfHealed?: boolean };
  model?: string;
  ghostReconstructed?: boolean;
  generatedAt?: string;
}

interface SquadState {
  currentVideoId: string | null;
  briefs: Record<string, SquadBrief>;
  loadingVideoId: string | null;
  error: string | null;
  setCurrentVideo: (id: string | null) => void;
  setLoading: (id: string | null) => void;
  setBrief: (id: string, brief: SquadBrief) => void;
  setError: (msg: string | null) => void;
}

const STORAGE_KEY = "tubeclick:squad-briefs:v1";

export const useSquadStore = create<SquadState>()(
  persist(
    (set) => ({
      currentVideoId: null,
      briefs: {},
      loadingVideoId: null,
      error: null,
      setCurrentVideo: (id) => set({ currentVideoId: id, error: null }),
      setLoading: (id) => set({ loadingVideoId: id, error: null }),
      setBrief: (id, brief) =>
        set((s) => ({ briefs: { ...s.briefs, [id]: brief }, loadingVideoId: null, error: null })),
      setError: (msg) => set({ error: msg, loadingVideoId: null }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() =>
        createPerUserStorage(STORAGE_KEY, () => {
          try { return useAuthStore.getState().user?.id ?? null; } catch { return null; }
        }),
      ),
      partialize: (s) => ({ briefs: s.briefs }),
    },
  ),
);
