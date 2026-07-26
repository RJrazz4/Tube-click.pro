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
  views: string; // Formatted views, e.g. "1.2M views"
  viewsCount: number; // Raw views for sorting
  publishedAt: string; // ISO date or relative, e.g. "3 days ago"
  publishedDate: string; // Raw date string for Recency Bias filtering
  channelName: string;
  duration?: string;
  isLocked: boolean; // True for locked videos (conveyor slot1/2 OR premium gate)
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
  glitchHook: string;
  fullScript: string;
  retentionKeywordsUsed: string[];
  seoTags: string[];
  thumbnailPrompt: string;
  editingGuide: string;
  tier: "free" | "premium";
  isStealthDisguised: boolean;
  changedAnalogiesCount: number;
  changedExamplesCount: number;
  glitchTechniques?: string[];
  glitchIntensity?: number;
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
  lastChannelUrl: string | null;
  savedNiche: string | null;

  // Daily Conveyor Belt: always exactly 3 tiles (slot0 unlocked, slot1+2 locked).
  conveyorQueue: CompetitorVideo[];
  activeVideoId: string | null;

  // Flat competitor view mirrors conveyorQueue for backward compatibility.
  competitors: CompetitorVideo[];
  isSearchingCompetitors: boolean;
  competitorsFetchedAt: string | null;

  envyMetrics: EnvyMetrics | null;
  threatAlerts: ThreatAlert[];
  wideningGap: WideningGap | null;

  rewrites: ScriptRewriteResult[];
  isRewriting: boolean;
  activeRewrite: ScriptRewriteResult | null;

  freeCooldownUntil: number | null;
  freeLockedVideoId: string | null;
  conveyorShiftPending: boolean;

  setProfile: (profile: ProfiledChannel | null, sourceUrl?: string | null) => void;
  setIsProfiling: (isProfiling: boolean) => void;
  setSavedNiche: (niche: string | null) => void;
  setLastChannelUrl: (url: string | null) => void;

  setCompetitors: (competitors: CompetitorVideo[], envyMetrics?: EnvyMetrics | null) => void;
  setConveyorQueue: (queue: CompetitorVideo[]) => void;
  setActiveVideoId: (id: string | null) => void;
  setIsSearchingCompetitors: (isSearchingCompetitors: boolean) => void;
  setThreatAlerts: (alerts: ThreatAlert[], wideningGap: WideningGap | null) => void;

  addRewrite: (rewrite: Omit<ScriptRewriteResult, "id" | "createdAt">) => ScriptRewriteResult;
  setIsRewriting: (isRewriting: boolean) => void;
  setActiveRewrite: (rewrite: ScriptRewriteResult | null) => void;
  deleteRewrite: (id: string) => void;

  startFreeCooldown: (videoId: string, durationMs?: number) => void;
  clearFreeCooldown: () => void;
  isInFreeCooldown: () => boolean;
  expireFreeCooldownCycle: () => void;
  appendConveyorTile: (video: CompetitorVideo) => void;
  markConveyorShiftConsumed: () => void;

  clearAll: () => void;
  beginNewWorkflow: () => void;
}

export const FREE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const CONVEYOR_SIZE = 3;

/** Stamp a competitor list into conveyor shape: 3 tiles, slot0 unlocked, slot1+2 locked. */
function stampConveyor(competitors: CompetitorVideo[]): CompetitorVideo[] {
  return viralOnly(competitors)
    .slice(0, CONVEYOR_SIZE)
    .map((c, i) => ({ ...c, isLocked: i > 0 }));
}

export const useCloneCrushStore = create<CloneCrushState>()(
  persist(
    (set, get) => ({
      profile: null,
      isProfiling: false,
      lastChannelUrl: null,
      savedNiche: null,
      conveyorQueue: [],
      activeVideoId: null,
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
      conveyorShiftPending: false,

      setProfile: (profile, sourceUrl = null) => set((state) => ({
        profile,
        lastChannelUrl: sourceUrl ?? state.lastChannelUrl,
      })),
      setIsProfiling: (isProfiling) => set({ isProfiling }),
      setLastChannelUrl: (url) => set({
        lastChannelUrl: url && url.trim().length > 0 ? url.trim() : null,
      }),
      setSavedNiche: (niche) => set({
        savedNiche: niche && niche.trim().length > 0 ? niche.trim() : null,
      }),

      setCompetitors: (competitors, envyMetrics = null) => {
        const queue = stampConveyor(competitors);
        set({
          conveyorQueue: queue,
          competitors: queue,
          competitorsFetchedAt: new Date().toISOString(),
          envyMetrics,
          activeVideoId: get().activeVideoId ?? (queue[0]?.videoId ?? null),
        });
      },
      setConveyorQueue: (queue) => {
        const stamped = stampConveyor(queue);
        set({ conveyorQueue: stamped, competitors: stamped });
      },
      setActiveVideoId: (id) => set({ activeVideoId: id }),
      setIsSearchingCompetitors: (isSearchingCompetitors) => set({ isSearchingCompetitors }),
      setThreatAlerts: (alerts, gap) => set({ threatAlerts: alerts, wideningGap: gap }),

      addRewrite: (rewriteInput) => {
        const newRewrite: ScriptRewriteResult = {
          ...rewriteInput,
          id: `rewrite_${Math.random().toString(36).substr(2, 9)}_${Date.now().toString(36)}`,
          createdAt: new Date().toISOString(),
        };
        set((state) => ({
          rewrites: [newRewrite, ...state.rewrites].slice(0, 50),
          activeRewrite: newRewrite,
        }));
        return newRewrite;
      },

      setIsRewriting: (isRewriting) => set({ isRewriting }),
      setActiveRewrite: (activeRewrite) => set({ activeRewrite }),

      deleteRewrite: (id) => set((state) => {
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
        conveyorShiftPending: false,
      }),

      clearFreeCooldown: () => set({
        freeCooldownUntil: null,
        freeLockedVideoId: null,
        conveyorShiftPending: false,
      }),

      isInFreeCooldown: () => {
        const s = get();
        return !!(s.freeCooldownUntil && s.freeCooldownUntil > Date.now() && s.freeLockedVideoId);
      },

      expireFreeCooldownCycle: () => set((state) => {
        if (!state.freeCooldownUntil || state.freeCooldownUntil > Date.now()) return state;
        // Shift: slot0 evicted, slot1->0 unlocked, slot2->1 locked.
        const shifted = stampConveyor(state.conveyorQueue.slice(1));
        const evictedVideoId = state.conveyorQueue[0]?.videoId ?? state.freeLockedVideoId;
        return {
          conveyorQueue: shifted,
          competitors: shifted,
          activeVideoId: shifted[0]?.videoId ?? null,
          activeRewrite: null,
          rewrites: state.rewrites.filter((r) => r.targetVideoId !== evictedVideoId),
          threatAlerts: [],
          wideningGap: null,
          freeCooldownUntil: null,
          freeLockedVideoId: null,
          conveyorShiftPending: true,
        };
      }),

      appendConveyorTile: (video) => set((state) => {
        const filtered = viralOnly([video]);
        if (filtered.length === 0) return state;
        const next = stampConveyor([...state.conveyorQueue, filtered[0]]);
        return {
          conveyorQueue: next,
          competitors: next,
          competitorsFetchedAt: new Date().toISOString(),
        };
      }),

      markConveyorShiftConsumed: () => set({ conveyorShiftPending: false }),

      beginNewWorkflow: () => {
        const s = get();
        if (s.freeCooldownUntil && s.freeCooldownUntil > Date.now() && s.freeLockedVideoId) return;
        set({
          profile: null,
          isProfiling: true,
          savedNiche: null,
          conveyorQueue: [],
          competitors: [],
          activeVideoId: null,
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
          conveyorShiftPending: false,
        });
      },

      clearAll: () => set({
        profile: null,
        isProfiling: false,
        lastChannelUrl: null,
        savedNiche: null,
        conveyorQueue: [],
        competitors: [],
        activeVideoId: null,
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
        conveyorShiftPending: false,
      }),
    }),
    {
      name: "tubegenius-clone-crush-store",
      version: 5,
      storage: createJSONStorage(() => createPerUserStorage(
        "tubegenius-clone-crush-store",
        () => useAuthStore.getState().user?.id ?? null,
      )),
      migrate: (persistedState: any, version) => {
        void version;
        const base = persistedState && typeof persistedState === "object" ? persistedState : {};
        const existingCompetitors = Array.isArray(base.competitors) ? viralOnly(base.competitors) : [];
        const queue = Array.isArray(base.conveyorQueue) && base.conveyorQueue.length
          ? stampConveyor(base.conveyorQueue)
          : stampConveyor(existingCompetitors);
        return {
          ...base,
          competitors: queue,
          conveyorQueue: queue,
          freeCooldownUntil: typeof base.freeCooldownUntil === "number" ? base.freeCooldownUntil : null,
          freeLockedVideoId: typeof base.freeLockedVideoId === "string" ? base.freeLockedVideoId : null,
          lastChannelUrl: typeof base.lastChannelUrl === "string" ? base.lastChannelUrl : null,
          savedNiche: typeof base.savedNiche === "string" ? base.savedNiche : null,
          activeVideoId: typeof base.activeVideoId === "string" ? base.activeVideoId : (queue[0]?.videoId ?? null),
          conveyorShiftPending: false,
        };
      },
      partialize: (state) => ({
        profile: state.profile,
        lastChannelUrl: state.lastChannelUrl,
        savedNiche: state.savedNiche,
        conveyorQueue: state.conveyorQueue,
        competitors: state.conveyorQueue,
        competitorsFetchedAt: state.competitorsFetchedAt,
        rewrites: state.rewrites,
        freeCooldownUntil: state.freeCooldownUntil,
        freeLockedVideoId: state.freeLockedVideoId,
        activeVideoId: state.activeVideoId,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const queue = stampConveyor(state.conveyorQueue?.length ? state.conveyorQueue : state.competitors ?? []);
        state.conveyorQueue = queue;
        state.competitors = queue;
        if (!state.activeVideoId) state.activeVideoId = queue[0]?.videoId ?? null;
      },
    }
  )
);
