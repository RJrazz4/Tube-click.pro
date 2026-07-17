import { create } from "zustand";

type SubscriptionTier = "free" | "pro" | "enterprise";

interface AppState {
  tier: SubscriptionTier;
  isPaywallLocked: boolean;
  sidebarOpen: boolean;
  setTier: (tier: SubscriptionTier) => void;
  setPaywallLocked: (locked: boolean) => void;
  setSidebarOpen: (open: boolean) => void;
}

/**
 * Lightweight global store — replaces scattered useState + localStorage polling
 * Phase A2 implementation begins here, but minimal for A1.
 */
export const useAppStore = create<AppState>((set) => ({
  tier: "free",
  isPaywallLocked: false,
  sidebarOpen: false,
  setTier: (tier) => set({ tier }),
  setPaywallLocked: (isPaywallLocked) => set({ isPaywallLocked }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
}));
