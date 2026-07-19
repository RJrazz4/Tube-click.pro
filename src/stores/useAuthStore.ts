/**
 * Licensing & Auth Store
 * Manages subscription tiers and feature access for the SaaS
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type SubscriptionTier = "free" | "pro" | "enterprise";
export type LicenseStatus = "active" | "expired" | "trial" | "none";

export interface LicenseInfo {
  tier: SubscriptionTier;
  status: LicenseStatus;
  expiresAt?: string;
  seats?: number;
  features: string[];
}

export interface FeatureAccess {
  canUseAI: boolean;
  canGenerateImages: boolean;
  canGenerateVoiceovers: boolean;
  canExport: boolean;
  maxGenerationsPerDay: number;
  maxThumbnails: number;
  maxScenes: number;
  hasAdvancedAnalytics: boolean;
  hasPrioritySupport: boolean;
  hasCustomBranding: boolean;
}

const TIER_FEATURES: Record<SubscriptionTier, FeatureAccess> = {
  free: {
    canUseAI: true,
    canGenerateImages: true, // Using Zero-Cost Hydra Router
    canGenerateVoiceovers: false,
    canExport: false,
    maxGenerationsPerDay: 10,
    maxThumbnails: 2,
    maxScenes: 4,
    hasAdvancedAnalytics: false,
    hasPrioritySupport: false,
    hasCustomBranding: false,
  },
  pro: {
    canUseAI: true,
    canGenerateImages: true,
    canGenerateVoiceovers: true,
    canExport: true,
    maxGenerationsPerDay: 100,
    maxThumbnails: 4,
    maxScenes: 8,
    hasAdvancedAnalytics: true,
    hasPrioritySupport: true,
    hasCustomBranding: false,
  },
  enterprise: {
    canUseAI: true,
    canGenerateImages: true,
    canGenerateVoiceovers: true,
    canExport: true,
    maxGenerationsPerDay: Infinity,
    maxThumbnails: 10,
    maxScenes: Infinity,
    hasAdvancedAnalytics: true,
    hasPrioritySupport: true,
    hasCustomBranding: true,
  },
};

export interface UserProfile {
  id: string;
  email?: string;
  name?: string;
  avatar?: string;
  createdAt: string;
  lastActive: string;
}

interface AuthState {
  // License state
  license: LicenseInfo;
  user: UserProfile | null;
  isAuthenticated: boolean;
  upgradeModalOpen: boolean;
  
  // Daily usage tracking
  dailyUsage: {
    date: string;
    generationsUsed: number;
    voiceCharactersUsed?: number;
  };
  
  // Actions
  setLicense: (license: Partial<LicenseInfo>) => void;
  setUser: (user: UserProfile | null) => void;
  setUpgradeModalOpen: (open: boolean) => void;
  updateUsage: () => void;
  updateVoiceUsage: (chars: number) => void;
  resetDailyUsage: () => void;
  checkAccess: (feature: keyof FeatureAccess) => boolean;
  getFeatures: () => FeatureAccess;
  upgradeTier: (tier: SubscriptionTier) => void;
  logout: () => void;
}

const DEFAULT_LICENSE: LicenseInfo = {
  tier: "free",
  status: "active",
  features: ["basic-generation"],
};

const getToday = () => new Date().toISOString().split("T")[0];

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      license: DEFAULT_LICENSE,
      user: null,
      isAuthenticated: false,
      upgradeModalOpen: false,
      dailyUsage: {
        date: getToday(),
        generationsUsed: 0,
      },

      setLicense: (licenseUpdate) =>
        set((state) => ({
          license: { ...state.license, ...licenseUpdate },
        })),

      setUser: (user) =>
        set({
          user,
          isAuthenticated: user !== null,
        }),

      setUpgradeModalOpen: (open) => set({ upgradeModalOpen: open }),

      updateUsage: () => {
        const today = getToday();
        const { dailyUsage } = get();
        
        if (dailyUsage.date !== today) {
          // Reset for new day
          set({
            dailyUsage: {
              date: today,
              generationsUsed: 1,
              voiceCharactersUsed: 0,
            },
          });
        } else {
          set({
            dailyUsage: {
              ...dailyUsage,
              generationsUsed: dailyUsage.generationsUsed + 1,
            },
          });
        }
      },

      updateVoiceUsage: (chars) => {
        const today = getToday();
        const { dailyUsage } = get();
        const currentVoiceUsed = dailyUsage.voiceCharactersUsed || 0;
        
        if (dailyUsage.date !== today) {
          set({
            dailyUsage: {
              date: today,
              generationsUsed: 0,
              voiceCharactersUsed: chars,
            },
          });
        } else {
          set({
            dailyUsage: {
              ...dailyUsage,
              voiceCharactersUsed: currentVoiceUsed + chars,
            },
          });
        }
      },

      resetDailyUsage: () =>
        set({
          dailyUsage: {
            date: getToday(),
            generationsUsed: 0,
            voiceCharactersUsed: 0,
          },
        }),

      checkAccess: (feature) => {
        const { license } = get();
        const features = TIER_FEATURES[license.tier];
        return features[feature] as boolean;
      },

      getFeatures: () => {
        const { license } = get();
        return TIER_FEATURES[license.tier];
      },

      upgradeTier: (tier) =>
        set((state) => ({
          license: {
            ...state.license,
            tier,
            status: "active",
            expiresAt: undefined,
          },
        })),

      logout: () =>
        set({
          user: null,
          isAuthenticated: false,
        }),
    }),
    {
      name: "tubegenius-auth-store",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        license: state.license,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        dailyUsage: state.dailyUsage,
      }),
    }
  )
);

// Selector hooks for specific slices
export const useLicense = () => useAuthStore((s) => s.license);
export const useUser = () => useAuthStore((s) => s.user);
export const useIsAuthenticated = () => useAuthStore((s) => s.isAuthenticated);
export const useFeatures = () => useAuthStore((s) => s.getFeatures());
export const useDailyUsage = () => useAuthStore((s) => s.dailyUsage);

// Check if user can perform an action
export const useCanPerform = () => {
  const features = useFeatures();
  const dailyUsage = useDailyUsage();
  const license = useLicense();
  
  return (action: keyof FeatureAccess) => {
    const canPerform = features[action] as boolean;
    const withinLimit = dailyUsage.generationsUsed < features.maxGenerationsPerDay;
    const isActive = license.status === "active" || license.status === "trial";
    
    return canPerform && withinLimit && isActive;
  };
};
