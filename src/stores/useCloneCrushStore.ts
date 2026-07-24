import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

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
  
  // Reset all Clone & Crush State
  clearAll: () => void;
}

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
      
      deleteRewrite: (id) => set((state) => ({
        rewrites: state.rewrites.filter((r) => r.id !== id),
        activeRewrite: state.activeRewrite?.id === id ? null : state.activeRewrite,
      })),

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
      }),
    }),
    {
      name: "tubegenius-clone-crush-store",
      version: 2,
      storage: createJSONStorage(() => localStorage),
      migrate: (persistedState: any) => ({
        ...persistedState,
        competitors: Array.isArray(persistedState?.competitors) ? viralOnly(persistedState.competitors) : [],
      }),
      partialize: (state) => ({
        profile: state.profile,
        competitors: viralOnly(state.competitors),
        competitorsFetchedAt: state.competitorsFetchedAt,
        rewrites: state.rewrites,
      }),
    }
  )
);
