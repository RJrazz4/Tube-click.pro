import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { createPerUserStorage } from "@/lib/storage/perUserStorage";
import { useAuthStore } from "./useAuthStore";

type SubscriptionTier = "free" | "pro" | "enterprise";

interface AppState {
  tier: SubscriptionTier;
  sidebarOpen: boolean;
  // UI smoothness state
  lastGenerationTime: number; // timestamp for debouncing
  // Actions
  setTier: (tier: SubscriptionTier) => void;
  setSidebarOpen: (open: boolean) => void;
  updateGenerationTime: () => void;
  canGenerate: () => boolean; // throttle check — prevents rapid-fire API burns
}

const MIN_GENERATION_INTERVAL = 1200; // 1.2s between generations — matches edge throttle

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      tier: "free",
      sidebarOpen: false,
      lastGenerationTime: 0,

      setTier: (tier) => set({ tier }),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),

      updateGenerationTime: () => set({ lastGenerationTime: Date.now() }),

      canGenerate: () => {
        const { lastGenerationTime } = get();
        return Date.now() - lastGenerationTime >= MIN_GENERATION_INTERVAL;
      },
    }),
    {
      name: "tubegenius-app-store",
      version: 2,
      // Per-user namespace: a Pro user's tier flag must never rehydrate
      // into a guest/other user's session.
      storage: createJSONStorage(() => createPerUserStorage(
        "tubegenius-app-store",
        () => useAuthStore.getState().user?.id ?? null,
      )),
      partialize: (state) => ({ tier: state.tier, sidebarOpen: state.sidebarOpen }),
    }
  )
);
