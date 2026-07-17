import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface Stats {
  scriptsGenerated: number;
  thumbnailsCreated: number;
  voiceoversGenerated: number;
  guidesCreated: number;
  lastUpdated: string;
}

export interface SavedContent {
  id: string;
  type: 'script' | 'thumbnail' | 'voiceover' | 'guide' | 'storyboard' | 'repurposed';
  title: string;
  content: string;
  createdAt: string;
  // Optional metadata for caching
  metadata?: {
    platform?: string;
    style?: string;
    language?: string;
    aspectRatio?: string;
  };
}

interface ContentState {
  stats: Stats;
  contents: SavedContent[];
  // Actions
  incrementStat: (key: keyof Omit<Stats, 'lastUpdated'>) => void;
  updateStats: (updates: Partial<Stats>) => void;
  saveContent: (content: Omit<SavedContent, 'id' | 'createdAt'>) => SavedContent;
  getSavedContent: () => SavedContent[];
  deleteContent: (id: string) => void;
  clearAll: () => void;
  getStats: () => Stats;
}

const DEFAULT_STATS: Stats = {
  scriptsGenerated: 0,
  thumbnailsCreated: 0,
  voiceoversGenerated: 0,
  guidesCreated: 0,
  lastUpdated: new Date().toISOString(),
};

export const useContentStore = create<ContentState>()(
  persist(
    (set, get) => ({
      stats: DEFAULT_STATS,
      contents: [],

      getStats: () => get().stats,

      getSavedContent: () => get().contents,

      updateStats: (updates) =>
        set((state) => ({
          stats: {
            ...state.stats,
            ...updates,
            lastUpdated: new Date().toISOString(),
          },
        })),

      incrementStat: (key) =>
        set((state) => ({
          stats: {
            ...state.stats,
            [key]: (state.stats[key] as number) + 1,
            lastUpdated: new Date().toISOString(),
          },
        })),

      saveContent: (content) => {
        const newItem: SavedContent = {
          ...content,
          id: Math.random().toString(36).substr(2, 9) + Date.now().toString(36),
          createdAt: new Date().toISOString(),
        };
        set((state) => ({
          contents: [newItem, ...state.contents].slice(0, 100), // Keep last 100, increased from 50 for power users
        }));
        return newItem;
      },

      deleteContent: (id) =>
        set((state) => ({
          contents: state.contents.filter((c) => c.id !== id),
        })),

      clearAll: () =>
        set({
          stats: { ...DEFAULT_STATS, lastUpdated: new Date().toISOString() },
          contents: [],
        }),
    }),
    {
      name: "tubegenius-content-store-v2", // New key — triggers migration from old localStorage keys
      storage: createJSONStorage(() => localStorage),
      // Only persist stats + contents
      partialize: (state) => ({ stats: state.stats, contents: state.contents }),
      // On rehydration, merge with old localStorage if exists (one-time migration)
      onRehydrateStorage: () => (state) => {
        try {
          // Migrate old keys once if new store empty
          if (state && state.contents.length === 0) {
            const oldStatsRaw = localStorage.getItem("tubegenius-stats");
            const oldContentRaw = localStorage.getItem("tubegenius-content");
            if (oldStatsRaw) {
              const oldStats = JSON.parse(oldStatsRaw);
              state.stats = { ...DEFAULT_STATS, ...oldStats };
            }
            if (oldContentRaw) {
              const oldContent = JSON.parse(oldContentRaw);
              if (Array.isArray(oldContent) && oldContent.length > 0) {
                state.contents = oldContent.slice(0, 100);
              }
            }
            // Cleanup old keys after migration
            if (oldStatsRaw || oldContentRaw) {
              setTimeout(() => {
                localStorage.removeItem("tubegenius-stats");
                localStorage.removeItem("tubegenius-content");
              }, 1000);
            }
          }
        } catch {}
      },
    }
  )
);
