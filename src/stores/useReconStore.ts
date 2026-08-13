/**
 * src/stores/useReconStore.ts — Ghost Visual Recon UI state.
 *
 * Per-user (namespaced via createPerUserStorage) zustand cache of
 * ingested-frame results and search hits per video. Mirrors the
 * interrogate + squad store patterns.
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createPerUserStorage } from "@/lib/storage/perUserStorage";
import { useAuthStore } from "./useAuthStore";

export interface ReconFrame {
  frameIdx: number;
  tsSeconds: number;
  thumbUrl: string;
  caption: string;
  visualTags: string[];
  similarity?: number;
  youtubeUrl: string;
}

interface ReconVideoState {
  videoId: string;
  framesIndexed: number;
  frames: ReconFrame[];
  searchResults: ReconFrame[];
  ingesting: boolean;
  searching: boolean;
  ready: boolean;
  error: string | null;
  lastQuery: string | null;
}

interface ReconState {
  videos: Record<string, ReconVideoState>;
  setIngesting: (videoId: string, on: boolean) => void;
  setReady: (videoId: string, frames: ReconFrame[]) => void;
  setSearching: (videoId: string, on: boolean) => void;
  setSearchResults: (videoId: string, query: string, results: ReconFrame[]) => void;
  setError: (videoId: string, msg: string | null) => void;
  get: (videoId: string) => ReconVideoState;
}

const emptyVid = (videoId: string): ReconVideoState => ({
  videoId, framesIndexed: 0, frames: [], searchResults: [],
  ingesting: false, searching: false, ready: false, error: null, lastQuery: null,
});

const STORAGE_KEY = "tubeclick:recon:v1";

export const useReconStore = create<ReconState>()(
  persist(
    (set, get) => ({
      videos: {},
      get: (videoId) => get().videos[videoId] ?? emptyVid(videoId),
      setIngesting: (videoId, on) => set((s) => ({
        videos: { ...s.videos, [videoId]: { ...(s.videos[videoId] ?? emptyVid(videoId)), ingesting: on, error: null } },
      })),
      setReady: (videoId, frames) => set((s) => ({
        videos: {
          ...s.videos,
          [videoId]: {
            ...(s.videos[videoId] ?? emptyVid(videoId)),
            ready: true, ingesting: false, framesIndexed: frames.length, frames, error: null,
          },
        },
      })),
      setSearching: (videoId, on) => set((s) => ({
        videos: { ...s.videos, [videoId]: { ...(s.videos[videoId] ?? emptyVid(videoId)), searching: on, error: null } },
      })),
      setSearchResults: (videoId, query, results) => set((s) => ({
        videos: {
          ...s.videos,
          [videoId]: {
            ...(s.videos[videoId] ?? emptyVid(videoId)),
            searching: false, searchResults: results, lastQuery: query, error: null,
          },
        },
      })),
      setError: (videoId, msg) => set((s) => ({
        videos: { ...s.videos, [videoId]: { ...(s.videos[videoId] ?? emptyVid(videoId)), error: msg, ingesting: false, searching: false } },
      })),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() =>
        createPerUserStorage(STORAGE_KEY, () => {
          try { return useAuthStore.getState().user?.id ?? null; } catch { return null; }
        }),
      ),
      partialize: (s) => ({ videos: s.videos }),
    },
  ),
);
