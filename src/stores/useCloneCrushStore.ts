import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { createPerUserStorage } from "@/lib/storage/perUserStorage";
import { useAuthStore } from "./useAuthStore";

export interface ProfiledChannel {
  id: string;
  url: string;
  name: string;
  handle: string;
  avatar: string;
  banner: string;
  description: string;
  profiledAt: string;
  // Envy Engine — profile metrics
  subscriberCount?: number;
  subscriberCountText?: string;
  videoCount?: number;
}

export interface CompetitorVideo {
  id: string; // Internal unique ID or YouTube Video ID
  videoId: string;
  title: string;
  url: string;
  thumbnail: string;
  views: string; // Formatted views, e.g., "1.2M views"
  viewsCount: number; // Raw views for sorting
  publishedAt: string; // ISO date or relative, e.g., "3 days ago"
  publishedDate: string; // Raw date string for Recency Bias filtering
  channelName: string;
  duration?: string;
  isLocked: boolean; // True for locked videos (premium/login gate)
  // Envy Engine — FOMO metrics
  estimatedRevenue?: string;
  estimatedRevenueNum?: number;
  viralVelocityScore?: number;
  uploadFrequency?: string;
  estimatedMonthlySubGrowth?: number;
  nicheCpm?: string;
  relevance?: string;
}

export interface ScriptRewriteResult {
  id: string;
  targetVideoId: string;
  targetVideoTitle: string;
  originalTitle: string;
  rewrittenTitle: string;
  glitchHook: string; // High-curiosity "Glitch" in first 15 seconds
  fullScript: string;
  retentionKeywordsUsed: string[];
  seoTags: string[];
  thumbnailPrompt: string;
  editingGuide: string;
  tier: "free" | "premium";
  isStealthDisguised: boolean; // Tracks enforcement of the "Stealth Disguise Protocol"
  changedAnalogiesCount: number;
  changedExamplesCount: number;
  // Glitch Protocol metadata
  glitchTechniques?: string[];
  glitchIntensity?: number; // 60 or 99
  // Reverse-engineered thumbnail prompts (from thumbnail-reverse action)
  reverseEngineeredPrompts?: string[];
  reverseEngineeredSource?: {
    videoId: string;
    title: string;
    views: string;
    channel: string;
    thumbnailUrl: string;
    analysis: string;
  } | null;
  createdAt: string;
}

export interface ThreatAlert {
  type: 'critical' | 'warning' | 'info';
  icon: string;
  message: string;
  competitorName: string;
  videoTitle: string;
  hoursAgo: number;
  urgencyScore: number;
}

export interface WideningGap {
  dailyLoss: number;
  monthlyLoss: number;
  multiplier: number;
  message: string;
}

export interface EnvyMetrics {
  totalCompetitorMonthlyRevenue: string;
  totalCompetitorMonthlyRevenueNum: number;
  averageViralVelocity: number;
  nicheCpm: string;
  niche: string;
}

const VIRAL_VIEW_THRESHOLD = 50_000;

function parseViews(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value));
  if (typeof value !== "string") return null;
  const normalized = value.toLowerCase().replace(/,/g, "").trim();
  const match = normalized.match(/([\d.]+)\s*(billion|million|thousand|b|m|k)?\s*views?/) || normalized.match(/([\d.]+)\s*(billion|million|thousand|b|m|k)/);
  if (!match) return null;
  const base = parseFloat(match[1]);
  if (!Number.isFinite(base)) return null;
  const suffix = (match[2] || "").toLowerCase();
  const multiplier = suffix.startsWith("b") ? 1_000_000_000 : suffix.startsWith("m") ? 1_000_000 : (suffix.startsWith("k") || suffix.startsWith("thousand")) ? 1_000 : 1;
  return Math.round(base * multiplier);
}

function viralOnly(competitors: CompetitorVideo[]): CompetitorVideo[] {
  return competitors.filter((competitor) => {
    const count = typeof competitor.viewsCount === "number" ? competitor.viewsCount : parseViews(competitor.views);
    return typeof count === "number" && count >= VIRAL_VIEW_THRESHOLD;
  });
}

interface CloneCrushState {
  // Channel Profile
  profile: ProfiledChannel | null;
  isProfiling: boolean;
  
  // Competitors Matrix
  competitors: CompetitorVideo[];
  isSearchingCompetitors: boolean;
  competitorsFetchedAt: string | null;
  
  // Envy Engine — aggregate metrics
  envyMetrics: EnvyMetrics | null;
  
  // Threat Alerts
  threatAlerts: ThreatAlert[];
  wideningGap: WideningGap | null;
  
  // Script Rewrites
  rewrites: ScriptRewriteResult[];
  isRewriting: boolean;
  activeRewrite: ScriptRewriteResult | null;

  // Free-tier 24h cooldown (monetization lock)
  //
  // After a free user's FIRST successful Chain-Loop generation their result
  // is locked on screen for FREE_COOLDOWN_MS (24h). During that window they
  // cannot start a new channel scan, select a different competitor, or wipe
  // the result. All other competitor tiles render under a cooldown
  // overlay with a live countdown and a "Skip Wait - Unlock Pro" CTA.
  // Pro users skip the cooldown entirely; becoming Pro clears it.
  freeCooldownUntil: number | null;   // epoch ms at which cooldown ends
  freeLockedVideoId: string | null;   // videoId whose result is locked on screen

  // Actions
  setProfile: (profile: ProfiledChannel | null) => void;
  setIsProfiling: (isProfiling: boolean) => void;
  
  setCompetitors: (competitors: CompetitorVideo[], envyMetrics?: EnvyMetrics | null) => void;
  setIsSearchingCompetitors: (isSearchingCompetitors: boolean) => void;
  setThreatAlerts: (alerts: ThreatAlert[], wideningGap: WideningGap | null) => void;
  
  addRewrite: (rewrite: Omit<ScriptRewriteResult, "id" | "createdAt">) => ScriptRewriteResult;
  setIsRewriting: (isRewriting: boolean) => void;
  setActiveRewrite: (rewrite: ScriptRewriteResult | null) => void;
  deleteRewrite: (id: string) => void;

  // Cooldown controls
  startFreeCooldown: (videoId: string, durationMs?: number) => void;
  clearFreeCooldown: () => void;
  isInFreeCooldown: () => boolean;
  
  // Reset all Clone & Crush State
  clearAll: () => void;
  // Hard reset for a new channel scan: keeps the store but wipes
  // competitors, rewrites, threat alerts and any active card so stale
  // video assets cannot linger between workflows. Disabled during free
  // cooldown so the locked 24h result cannot be evicted.
  beginNewWorkflow: () => void;
}

export const FREE_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24h

export const useCloneCrushStore = create<CloneCrushState>()(
  persist(
    (set, get) => ({
      profile: null,
      isProfiling: false,
      competitors: [],
      isSearchingCompetitors: false,
      competitorsFetchedAt: null,
      envyMetrics: null,
      threatAlerts: [],
      wideningGap: null,
      rewrites: [],
      isRewriting: false,
      activeRewrite: null,
      freeCooldownUntil: null,
      freeLockedVideoId: null,

      setProfile: (profile) => set({ profile }),
      setIsProfiling: (isProfiling) => set({ isProfiling }),

      setCompetitors: (competitors, envyMetrics = null) => set({
        competitors: viralOnly(competitors),
        competitorsFetchedAt: new Date().toISOString(),
        envyMetrics,
      }),
      setIsSearchingCompetitors: (isSearchingCompetitors) => set({ isSearchingCompetitors }),
      setThreatAlerts: (alerts, gap) => set({ threatAlerts: alerts, wideningGap: gap }),

      addRewrite: (rewriteInput) => {
        const newRewrite: ScriptRewriteResult = {
          ...rewriteInput,
          id: `rewrite_${Math.random().toString(36).substr(2, 9)}_${Date.now().toString(36)}`,
          createdAt: new Date().toISOString(),
        };

        set((state) => ({
          rewrites: [newRewrite, ...state.rewrites].slice(0, 50), // Keep last 50 rewrites
          activeRewrite: newRewrite,
        }));

        return newRewrite;
      },

      setIsRewriting: (isRewriting) => set({ isRewriting }),
      setActiveRewrite: (activeRewrite) => set({ activeRewrite }),
      
      deleteRewrite: (id) => set((state) => {
        // During cooldown the locked rewrite cannot be deleted.
        const now = Date.now();
        if (state.freeCooldownUntil && state.freeCooldownUntil > now) {
          const lockedRewrite = state.rewrites.find((r) => r.targetVideoId === state.freeLockedVideoId);
          if (lockedRewrite && lockedRewrite.id === id) return state;
        }
        return {
          rewrites: state.rewrites.filter((r) => r.id !== id),
          activeRewrite: state.activeRewrite?.id === id ? null : state.activeRewrite,
        };
      }),

      startFreeCooldown: (videoId, durationMs = FREE_COOLDOWN_MS) => set({
        freeCooldownUntil: Date.now() + durationMs,
        freeLockedVideoId: videoId,
      }),

      clearFreeCooldown: () => set({
        freeCooldownUntil: null,
        freeLockedVideoId: null,
      }),

      isInFreeCooldown: () => {
        const s = get();
        return !!(s.freeCooldownUntil && s.freeCooldownUntil > Date.now() && s.freeLockedVideoId);
      },

      beginNewWorkflow: () => {
        // A free-tier user mid-cooldown MUST NOT be allowed to wipe the
        // currently-locked result. The server will also reject any new
        // run (daily_quota SECURITY DEFINER), but the client must refuse
        // to reset the UI too so the 24h lock holds even before the RPC
        // round-trip.
        const s = get();
        if (s.freeCooldownUntil && s.freeCooldownUntil > Date.now() && s.freeLockedVideoId) return;
        set({
          profile: null,
          isProfiling: true,
          competitors: [],
          isSearchingCompetitors: false,
          competitorsFetchedAt: null,
          envyMetrics: null,
          threatAlerts: [],
          wideningGap: null,
          rewrites: [],
          isRewriting: false,
          activeRewrite: null,
        });
      },

      clearAll: () => set({
        profile: null,
        isProfiling: false,
        competitors: [],
        isSearchingCompetitors: false,
        competitorsFetchedAt: null,
        envyMetrics: null,
        threatAlerts: [],
        wideningGap: null,
        rewrites: [],
        isRewriting: false,
        activeRewrite: null,
        freeCooldownUntil: null,
        freeLockedVideoId: null,
      }),
    }),
    {
      name: "tubegenius-clone-crush-store",
      version: 4,
      storage: createJSONStorage(() => createPerUserStorage(
        "tubegenius-clone-crush-store",
        () => useAuthStore.getState().user?.id ?? null,
      )),
      migrate: (persistedState: any, version) => {
        // v3 -> v4: add freeCooldownUntil/freeLockedVideoId defaults.
        void version;
        const base = persistedState && typeof persistedState === "object" ? persistedState : {};
        return {
          ...base,
          competitors: Array.isArray(base.competitors) ? viralOnly(base.competitors) : [],
          freeCooldownUntil: typeof base.freeCooldownUntil === "number" ? base.freeCooldownUntil : null,
          freeLockedVideoId: typeof base.freeLockedVideoId === "string" ? base.freeLockedVideoId : null,
        };
      },
      partialize: (state) => ({
        profile: state.profile,
        competitors: viralOnly(state.competitors),
        competitorsFetchedAt: state.competitorsFetchedAt,
        rewrites: state.rewrites,
        freeCooldownUntil: state.freeCooldownUntil,
        freeLockedVideoId: state.freeLockedVideoId,
      }),
    }
  )
);
