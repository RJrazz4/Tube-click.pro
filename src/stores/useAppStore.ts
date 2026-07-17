import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

type SubscriptionTier = "free" | "pro" | "enterprise";

interface AppState {
  tier: SubscriptionTier;
  isPaywallLocked: boolean;
  sidebarOpen: boolean;
  // UI smoothness state
  lastGenerationTime: number; // timestamp for debouncing
  // Actions
  setTier: (tier: SubscriptionTier) => void;
  setPaywallLocked: (locked: boolean) => void;
  setSidebarOpen: (open: boolean) => void;
  updateGenerationTime: () => void;
  canGenerate: () => boolean; // throttle check — prevents rapid-fire API burns
}

const MIN_GENERATION_INTERVAL = 1200; // 1.2s between generations — matches edge throttle

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      tier: "free",
      isPaywallLocked: false,
      sidebarOpen: false,
      lastGenerationTime: 0,

      setTier: (tier) => set({ tier }),
      setPaywallLocked: (isPaywallLocked) => set({ isPaywallLocked }),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),

      updateGenerationTime: () => set({ lastGenerationTime: Date.now() }),

      canGenerate: () => {
        const { lastGenerationTime } = get();
        return Date.now() - lastGenerationTime >= MIN_GENERATION_INTERVAL;
      },
    }),
    {
      name: "tubegenius-app-store",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ tier: state.tier, sidebarOpen: state.sidebarOpen }),
    }
  )
);
