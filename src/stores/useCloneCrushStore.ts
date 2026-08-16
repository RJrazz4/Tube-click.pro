import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { createPerUserStorage } from "@/lib/storage/perUserStorage";
import { useAuthStore } from "./useAuthStore";

export type CloneCrushOutputLanguage = "English" | "Hindi" | "Hinglish";

export const DEFAULT_CLONE_CRUSH_OUTPUT_LANGUAGE: CloneCrushOutputLanguage = "English";

export function normalizeCloneCrushOutputLanguage(value: unknown): CloneCrushOutputLanguage {
  return value === "Hindi" || value === "Hinglish" || value === "English"
    ? value
    : DEFAULT_CLONE_CRUSH_OUTPUT_LANGUAGE;
}

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
  extractedKeywords?: string[];
  /** Which Ghost Cache slot (0..n) this profile is bound to. 0 = primary. */
  slotIndex?: number;
}

export interface SavedChannel {
  slotIndex: number;      // 0..4
  url: string;
  handle: string;
  name: string;
  avatar: string;
  niche: string | null;
  savedAt: string;
}

export interface CompetitorVideo {
  id: string;
  videoId: string;
  title: string;
  url: string;
  thumbnail: string;
  views: string;
  viewsCount: number;
  publishedAt: string;
  publishedDate: string;
  channelName: string;
  duration?: string;
  isLocked: boolean;
  estimatedRevenue?: string;
  estimatedRevenueNum?: number;
  viralVelocityScore?: number;
  uploadFrequency?: string;
  estimatedMonthlySubGrowth?: number;
  nicheCpm?: string;
  relevance?: string;
  ghostNode?: string;
  isGhostReconstructed?: boolean;
}

export interface ScriptRewriteResult {
  id: string;
  targetVideoId: string;
  targetVideoTitle: string;
  originalTitle: string;
  outputLanguage: CloneCrushOutputLanguage;
  rewrittenTitle: string;
  glitchHook: string;
  fullScript: string;
  retentionKeywordsUsed: string[];
  seoTags: string[];
  thumbnailPrompt: string;
  editingGuide: string;
  tier: "free" | "premium";
  glitchIntensity: number;
  isStealthDisguised: boolean;
  changedAnalogiesCount: number;
  changedExamplesCount: number;
  glitchTechniques?: string[];
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
export const CONVEYOR_SIZE = 3;
export const FREE_GHOST_CACHE_SLOTS = 1;
export const PRO_GHOST_CACHE_SLOTS = 5;
export const FREE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const SEEN_IDS_RING_MAX = 200;

/**
 * Compare user-entered channel targets without allowing harmless whitespace or
 * one trailing slash to look like a replacement. We deliberately do not
 * rewrite a YouTube path or channel ID: those identifiers may be case-sensitive.
 */
export function normalizeChannelUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function isSameChannelUrl(left: string, right: string): boolean {
  return normalizeChannelUrl(left) === normalizeChannelUrl(right);
}

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
  // Channel profile + Ghost Cache
  profile: ProfiledChannel | null;
  isProfiling: boolean;
  savedChannels: SavedChannel[];
  activeSlotIndex: number;
  savedNiche: string | null;
  /** Persisted language contract for all generated Clone & Crush output. */
  outputLanguage: CloneCrushOutputLanguage;
  /** Persisted, unsubmitted input text. */
  channelDraft: string;
  /** The first URL submitted while on Free. UI changes cannot replace it. */
  freeLockedChannelUrl: string | null;

  // Sliding 3-slot conveyor
  conveyorQueue: CompetitorVideo[];
  activeVideoId: string | null;
  conveyorCursor: string | null;
  conveyorWindowId: string | null;
  conveyorAppending: boolean;
  conveyorShiftPending: boolean;
  seenVideoIds: string[];

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

  setProfile: (profile: ProfiledChannel | null, sourceUrl?: string | null) => void;
  setIsProfiling: (isProfiling: boolean) => void;
  setSavedNiche: (niche: string | null) => void;
  setOutputLanguage: (language: CloneCrushOutputLanguage) => void;
  setLastChannelUrl: (url: string | null) => void;
  setChannelDraft: (draft: string, tier?: "free" | "pro") => { ok: boolean; reason?: "URL_LOCKED" };
  submitChannelUrl: (url: string, tier?: "free" | "pro") => { ok: boolean; reason?: "EMPTY_URL" | "URL_LOCKED"; url?: string };

  setCompetitors: (competitors: CompetitorVideo[], envyMetrics?: EnvyMetrics | null, meta?: { nextCursor?: string | null; windowId?: string | null }) => void;
  setConveyorQueue: (queue: CompetitorVideo[]) => void;
  setActiveVideoId: (id: string | null) => void;
  setConveyorAppending: (v: boolean) => void;
  setIsSearchingCompetitors: (isSearchingCompetitors: boolean) => void;
  setThreatAlerts: (alerts: ThreatAlert[], wideningGap: WideningGap | null) => void;

  addRewrite: (rewrite: Omit<ScriptRewriteResult, "id" | "createdAt">) => ScriptRewriteResult;
  setIsRewriting: (isRewriting: boolean) => void;
  setActiveRewrite: (rewrite: ScriptRewriteResult | null) => void;
  deleteRewrite: (id: string) => void;

  startFreeCooldown: (videoId: string, durationMs?: number) => void;
  /** Start the active Slot 1 timer without marking it consumed. */
  startFreeConveyorTimer: (durationMs?: number) => void;
  clearFreeCooldown: () => void;
  isInFreeCooldown: () => boolean;
  expireFreeCooldownCycle: () => void;
  appendConveyorTile: (video: CompetitorVideo) => void;
  markConveyorShiftConsumed: () => void;
  /** Shift + append one video. Called after a successful consume-Slot0. */
  advanceAfterConsume: (nextVideo?: CompetitorVideo | null, nextCursor?: string | null) => void;
  markSeenVideo: (videoId: string) => void;

  saveChannelToCache: (
    channel: Pick<SavedChannel, "url" | "handle" | "name" | "avatar" | "niche">,
    slotIndex?: number,
    tier?: "free" | "pro",
  ) => { ok: boolean; reason?: string; slotIndex?: number };
  removeChannelFromCache: (slotIndex: number) => void;
  switchActiveSlot: (slotIndex: number) => void;

  clearAll: () => void;
  beginNewWorkflow: () => void;
}

/** Stamp a competitor list into conveyor shape: exactly CONVEYOR_SIZE tiles,
 *  slot0 unlocked, slots 1+ locked; viral threshold enforced. */
function stampConveyor(competitors: CompetitorVideo[]): CompetitorVideo[] {
  return viralOnly(competitors)
    .slice(0, CONVEYOR_SIZE)
    .map((c, i) => ({ ...c, isLocked: i > 0 }));
}

/** Enforce a ring-buffer of seen video IDs for dedup across sessions. */
function pushSeen(existing: string[], id: string): string[] {
  if (!id) return existing;
  const next = existing.filter((x) => x !== id);
  next.unshift(id);
  return next.slice(0, SEEN_IDS_RING_MAX);
}

export const useCloneCrushStore = create<CloneCrushState>()(
  persist(
    (set, get) => ({
      profile: null,
      isProfiling: false,
      savedChannels: [],
      activeSlotIndex: 0,
      savedNiche: null,
      outputLanguage: DEFAULT_CLONE_CRUSH_OUTPUT_LANGUAGE,
      channelDraft: "",
      freeLockedChannelUrl: null,
      conveyorQueue: [],
      activeVideoId: null,
      conveyorCursor: null,
      conveyorWindowId: null,
      conveyorAppending: false,
      conveyorShiftPending: false,
      seenVideoIds: [],
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

      setProfile: (profile, sourceUrl = null) => set((state) => ({
        profile,
        // When a profile lands, also sync it into the primary Ghost Cache slot.
        savedChannels: profile
          ? (() => {
              const existing = state.savedChannels.find((c) => c.url === profile.url);
              const entry: SavedChannel = {
                slotIndex: existing?.slotIndex ?? state.activeSlotIndex ?? 0,
                url: profile.url,
                handle: profile.handle,
                name: profile.name,
                avatar: profile.avatar,
                niche: state.savedNiche,
                savedAt: new Date().toISOString(),
              };
              const others = state.savedChannels.filter((c) => c.url !== profile.url && c.slotIndex !== entry.slotIndex);
              return [...others, entry].sort((a, b) => a.slotIndex - b.slotIndex);
            })()
          : state.savedChannels,
        ...(sourceUrl ? { lastChannelUrl_deprecated: undefined } : {}),
      })),
      setIsProfiling: (isProfiling) => set({ isProfiling }),
      setOutputLanguage: (outputLanguage) => set({
        outputLanguage: normalizeCloneCrushOutputLanguage(outputLanguage),
      }),
      setLastChannelUrl: (_url) => {
        // Deprecated in v6 — Ghost Cache owns URL persistence. No-op left for
        // backward compatibility with older call sites.
      },
      setChannelDraft: (draft, tier = "free") => {
        const state = get();
        if (
          tier !== "pro" &&
          state.freeLockedChannelUrl &&
          !isSameChannelUrl(draft, state.freeLockedChannelUrl)
        ) {
          return { ok: false, reason: "URL_LOCKED" };
        }
        set({ channelDraft: draft });
        return { ok: true };
      },
      submitChannelUrl: (url, tier = "free") => {
        const submittedUrl = url.trim();
        if (!submittedUrl) return { ok: false, reason: "EMPTY_URL" };

        const state = get();
        if (
          tier !== "pro" &&
          state.freeLockedChannelUrl &&
          !isSameChannelUrl(submittedUrl, state.freeLockedChannelUrl)
        ) {
          return { ok: false, reason: "URL_LOCKED" };
        }

        // Lock + draft are committed in one Zustand write. A second rapid Free
        // submission therefore observes the first URL and cannot replace it.
        set({
          channelDraft: submittedUrl,
          freeLockedChannelUrl:
            tier === "pro" ? state.freeLockedChannelUrl : (state.freeLockedChannelUrl ?? submittedUrl),
        });
        return { ok: true, url: submittedUrl };
      },
      setSavedNiche: (niche) => set((state) => ({
        savedNiche: niche && niche.trim().length > 0 ? niche.trim() : null,
        // Sync niche to active cache slot if present.
        savedChannels: state.savedChannels.map((c) =>
          c.slotIndex === state.activeSlotIndex ? { ...c, niche: niche && niche.trim().length > 0 ? niche.trim() : c.niche } : c,
        ),
      })),

      setCompetitors: (competitors, envyMetrics = null, meta = {}) => {
        const queue = stampConveyor(competitors);
        const seen = get().seenVideoIds.slice();
        competitors.forEach((c) => seen.unshift(c.videoId));
        set({
          conveyorQueue: queue,
          competitors: queue,
          competitorsFetchedAt: new Date().toISOString(),
          envyMetrics,
          activeVideoId: get().activeVideoId ?? (queue[0]?.videoId ?? null),
          conveyorCursor: meta.nextCursor ?? null,
          conveyorWindowId: meta.windowId ?? get().conveyorWindowId,
          conveyorAppending: false,
          conveyorShiftPending: false,
          seenVideoIds: seen.slice(0, SEEN_IDS_RING_MAX),
        });
      },
      setConveyorQueue: (queue) => {
        const stamped = stampConveyor(queue);
        set({ conveyorQueue: stamped, competitors: stamped });
      },
      setActiveVideoId: (id) => set({ activeVideoId: id }),
      setConveyorAppending: (v) => set({ conveyorAppending: v }),
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

      startFreeCooldown: (videoId, durationMs = FREE_COOLDOWN_MS) => set((state) => ({
        // Consuming Slot 1 pins its result but never restarts an already
        // running conveyor window. Every active result receives exactly the
        // window granted when it was first exposed/promoted.
        freeCooldownUntil:
          state.freeCooldownUntil && state.freeCooldownUntil > Date.now()
            ? state.freeCooldownUntil
            : Date.now() + durationMs,
        freeLockedVideoId: videoId,
        conveyorShiftPending: false,
      })),

      startFreeConveyorTimer: (durationMs = FREE_COOLDOWN_MS) => set((state) => ({
        freeCooldownUntil: state.conveyorQueue[0] ? Date.now() + durationMs : null,
        // The promoted/current slot is available until consumed. The server's
        // rolling quota is still authoritative when Execute is pressed.
        freeLockedVideoId: null,
        conveyorShiftPending: false,
      })),

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
          // Every promoted Slot 1 receives a fresh 24-hour window. It is not
          // marked consumed until a successful Free Chain-Loop, so it remains
          // actionable while the server independently enforces rolling quota.
          freeCooldownUntil: shifted[0] ? Date.now() + FREE_COOLDOWN_MS : null,
          freeLockedVideoId: null,
          conveyorShiftPending: true,
        };
      }),

      appendConveyorTile: (video) => set((state) => {
        const filtered = viralOnly([video]);
        if (filtered.length === 0) return state;
        // Append, then re-stamp to enforce size+lock invariants.
        const next = stampConveyor([...state.conveyorQueue, filtered[0]]);
        const needsFreshSlotOneTimer = Boolean(
          next[0] &&
          state.conveyorShiftPending &&
          (!state.freeCooldownUntil || state.freeCooldownUntil <= Date.now()),
        );
        return {
          conveyorQueue: next,
          competitors: next,
          competitorsFetchedAt: new Date().toISOString(),
          conveyorAppending: false,
          // If expiry emptied a short queue, this refill is the newly exposed
          // Slot 1 and must receive the same fresh 24-hour window as a promoted
          // teaser. A normal append behind an existing Slot 1 keeps its timer.
          freeCooldownUntil: needsFreshSlotOneTimer
            ? Date.now() + FREE_COOLDOWN_MS
            : state.freeCooldownUntil,
          seenVideoIds: pushSeen(state.seenVideoIds, filtered[0].videoId),
        };
      }),

      markConveyorShiftConsumed: () => set({ conveyorShiftPending: false }),

      advanceAfterConsume: (nextVideo, nextCursor) => set((state) => {
        // Atomic shift+append for when the client has the next tile in hand
        // (saves one round trip). Evict slot0's rewrite.
        const evictedVideoId = state.conveyorQueue[0]?.videoId ?? state.freeLockedVideoId;
        const base = state.conveyorQueue.slice(1);
        const withAppended = nextVideo ? [...base, nextVideo] : base;
        const next = stampConveyor(withAppended);
        return {
          conveyorQueue: next,
          competitors: next,
          activeVideoId: next[0]?.videoId ?? null,
          activeRewrite: null,
          rewrites: state.rewrites.filter((r) => r.targetVideoId !== evictedVideoId),
          threatAlerts: [],
          wideningGap: null,
          conveyorCursor: nextCursor ?? state.conveyorCursor,
          conveyorAppending: false,
          conveyorShiftPending: !nextVideo, // if we didn't have one in hand, fetch it
          seenVideoIds: nextVideo ? pushSeen(state.seenVideoIds, nextVideo.videoId) : state.seenVideoIds,
          competitorsFetchedAt: new Date().toISOString(),
        };
      }),

      markSeenVideo: (videoId) => set((state) => ({ seenVideoIds: pushSeen(state.seenVideoIds, videoId) })),

      saveChannelToCache: (channel, slotIndex, tier = "free") => {
        const state = get();
        const isPro = tier === "pro";
        const maxSlots = isPro ? PRO_GHOST_CACHE_SLOTS : FREE_GHOST_CACHE_SLOTS;

        // Defense in depth for call sites that bypass submitChannelUrl. Fully
        // hydrated canonical profile URLs are written by setProfile instead.
        if (!isPro && state.freeLockedChannelUrl && !isSameChannelUrl(channel.url, state.freeLockedChannelUrl)) {
          return { ok: false, reason: "URL_LOCKED" };
        }

        const existing = state.savedChannels.find((c) => c.url === channel.url);
        const targetSlot = existing ? existing.slotIndex : (typeof slotIndex === "number" ? slotIndex : state.savedChannels.length);
        if (targetSlot >= maxSlots) {
          return { ok: false, reason: "SLOT_LIMIT" };
        }
        const entry: SavedChannel = {
          slotIndex: targetSlot,
          url: channel.url,
          handle: channel.handle,
          name: channel.name,
          avatar: channel.avatar,
          niche: channel.niche ?? state.savedNiche,
          savedAt: new Date().toISOString(),
        };
        const others = state.savedChannels.filter((c) => c.url !== channel.url && c.slotIndex !== targetSlot);
        set({ savedChannels: [...others, entry].sort((a, b) => a.slotIndex - b.slotIndex) });
        return { ok: true, slotIndex: targetSlot };
      },

      removeChannelFromCache: (slotIndex) => set((state) => ({
        savedChannels: state.savedChannels.filter((c) => c.slotIndex !== slotIndex),
        // If the removed slot was active, reset to slot 0.
        activeSlotIndex: state.activeSlotIndex === slotIndex ? 0 : state.activeSlotIndex,
      })),

      switchActiveSlot: (slotIndex) => set((state) => {
        const slot = state.savedChannels.find((c) => c.slotIndex === slotIndex);
        if (!slot) return state;
        return {
          activeSlotIndex: slotIndex,
          // Switching channels wipes the current conveyor so the next
          // bootstrap fetches a niche-correct matrix for the new channel.
          profile: null,
          conveyorQueue: [],
          competitors: [],
          conveyorCursor: null,
          conveyorWindowId: null,
          activeVideoId: null,
          activeRewrite: null,
          rewrites: [],
          threatAlerts: [],
          wideningGap: null,
          savedNiche: slot.niche,
          isSearchingCompetitors: false,
        };
      }),

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
          conveyorCursor: null,
          conveyorWindowId: null,
          conveyorShiftPending: false,
          conveyorAppending: false,
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
        });
      },

      clearAll: () => set({
        profile: null,
        isProfiling: false,
        savedChannels: [],
        activeSlotIndex: 0,
        savedNiche: null,
        outputLanguage: DEFAULT_CLONE_CRUSH_OUTPUT_LANGUAGE,
        channelDraft: "",
        freeLockedChannelUrl: null,
        conveyorQueue: [],
        competitors: [],
        activeVideoId: null,
        conveyorCursor: null,
        conveyorWindowId: null,
        conveyorAppending: false,
        conveyorShiftPending: false,
        seenVideoIds: [],
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
      version: 8,
      storage: createJSONStorage(() => createPerUserStorage(
        "tubegenius-clone-crush-store",
        () => useAuthStore.getState().user?.id ?? null,
      )),
      migrate: (persistedState: any, version) => {
        const base = persistedState && typeof persistedState === "object" ? persistedState : {};
        const outputLanguage = normalizeCloneCrushOutputLanguage(base.outputLanguage);
        const rewrites = Array.isArray(base.rewrites)
          ? base.rewrites.map((rewrite: ScriptRewriteResult) => ({
              ...rewrite,
              outputLanguage: normalizeCloneCrushOutputLanguage(rewrite?.outputLanguage ?? outputLanguage),
            }))
          : [];
        const existingCompetitors = Array.isArray(base.competitors) ? viralOnly(base.competitors) : [];
        const queue = Array.isArray(base.conveyorQueue) && base.conveyorQueue.length
          ? stampConveyor(base.conveyorQueue)
          : stampConveyor(existingCompetitors);
        // Migrate the legacy single lastChannelUrl into the slot-0 Ghost Cache.
        const legacyUrl = typeof base.lastChannelUrl === "string" ? base.lastChannelUrl : null;
        const existingChannels = Array.isArray(base.savedChannels) ? base.savedChannels : [];
        const migratedChannels: SavedChannel[] = existingChannels.length
          ? existingChannels
          : legacyUrl
            ? [{ slotIndex: 0, url: legacyUrl, handle: legacyUrl, name: "Saved Channel", avatar: "", niche: typeof base.savedNiche === "string" ? base.savedNiche : null, savedAt: new Date().toISOString() }]
            : [];
        // A draft is not proof of submission. Only an existing lock or legacy
        // state written after a successful profile/cache save may become the
        // immutable Free URL during migration.
        const migratedSubmittedUrl =
          (typeof base.freeLockedChannelUrl === "string" && base.freeLockedChannelUrl) ||
          legacyUrl ||
          migratedChannels[0]?.url ||
          (typeof base.profile?.url === "string" ? base.profile.url : "");
        return {
          ...base,
          outputLanguage,
          rewrites,
          channelDraft:
            typeof base.channelDraft === "string"
              ? base.channelDraft
              : migratedSubmittedUrl,
          // Existing slot-0 channels came from a prior successful submission;
          // adopt them as the immutable Free lock during the v6 -> v8 upgrade.
          // Never adopt channelDraft: it may be persisted but unsubmitted.
          freeLockedChannelUrl: migratedSubmittedUrl || null,
          competitors: queue,
          conveyorQueue: queue,
          freeCooldownUntil:
            typeof base.freeCooldownUntil === "number"
              ? base.freeCooldownUntil
              : (queue[0] ? Date.now() + FREE_COOLDOWN_MS : null),
          freeLockedVideoId: typeof base.freeLockedVideoId === "string" ? base.freeLockedVideoId : null,
          savedNiche: typeof base.savedNiche === "string" ? base.savedNiche : null,
          activeVideoId: typeof base.activeVideoId === "string" ? base.activeVideoId : (queue[0]?.videoId ?? null),
          conveyorShiftPending: false,
          conveyorAppending: false,
          conveyorCursor: null,
          conveyorWindowId: typeof base.conveyorWindowId === "string" ? base.conveyorWindowId : null,
          seenVideoIds: Array.isArray(base.seenVideoIds) ? base.seenVideoIds.slice(0, SEEN_IDS_RING_MAX) : [],
          savedChannels: migratedChannels,
          activeSlotIndex: typeof base.activeSlotIndex === "number" ? base.activeSlotIndex : 0,
        };
      },
      partialize: (state) => ({
        profile: state.profile,
        savedChannels: state.savedChannels,
        activeSlotIndex: state.activeSlotIndex,
        savedNiche: state.savedNiche,
        outputLanguage: state.outputLanguage,
        channelDraft: state.channelDraft,
        freeLockedChannelUrl: state.freeLockedChannelUrl,
        conveyorQueue: state.conveyorQueue,
        competitors: state.conveyorQueue,
        competitorsFetchedAt: state.competitorsFetchedAt,
        rewrites: state.rewrites,
        freeCooldownUntil: state.freeCooldownUntil,
        freeLockedVideoId: state.freeLockedVideoId,
        activeVideoId: state.activeVideoId,
        conveyorCursor: state.conveyorCursor,
        conveyorWindowId: state.conveyorWindowId,
        // Persist the brief shift-before-append phase so a tab close cannot
        // strand a shortened queue without requesting its replacement tile.
        conveyorShiftPending: state.conveyorShiftPending,
        seenVideoIds: state.seenVideoIds,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const queue = stampConveyor(state.conveyorQueue?.length ? state.conveyorQueue : state.competitors ?? []);
        state.conveyorQueue = queue;
        state.competitors = queue;
        if (!state.activeVideoId) state.activeVideoId = queue[0]?.videoId ?? null;
        if (!Array.isArray(state.seenVideoIds)) state.seenVideoIds = [];
        if (!Array.isArray(state.savedChannels)) state.savedChannels = [];
        state.outputLanguage = normalizeCloneCrushOutputLanguage(state.outputLanguage);
        if (Array.isArray(state.rewrites)) {
          state.rewrites = state.rewrites.map((rewrite) => ({
            ...rewrite,
            outputLanguage: normalizeCloneCrushOutputLanguage(rewrite.outputLanguage ?? state.outputLanguage),
          }));
        }
        if (typeof state.channelDraft !== "string") state.channelDraft = state.freeLockedChannelUrl ?? "";
        if (typeof state.freeLockedChannelUrl !== "string") state.freeLockedChannelUrl = null;
      },
    }
  )
);
