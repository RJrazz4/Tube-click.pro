import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Zap, Sparkles, Copy, Check, FileText, Youtube, Loader2, Lock, Download, RefreshCw, CheckCircle2, AlertTriangle, ArrowRight, ShieldAlert, Compass, History, TrendingUp, ChevronRight, XCircle, Mic, Image, Search, DollarSign, Flame, Gauge, Share2, Terminal, Cpu, Activity, Radio, Database, PlusCircle, Shield, Languages,
} from "lucide-react";
import { GhostInterrogationDrawer } from "@/components/ghost/GhostInterrogationDrawer";
import { GhostSquadDossier } from "@/components/ghost/GhostSquadDossier";
import { GhostVisualRecon } from "@/components/ghost/GhostVisualRecon";
import { DawnPatrolCard } from "@/components/ghost/DawnPatrolCard";
import { NeuralVelocityEngine } from "@/components/ui/NeuralVelocityEngine";
import { ParticleBurst } from "@/components/ui/ParticleBurst";
import { ProtectedVideoPreview } from "@/components/showdown/ProtectedVideoPreview";
import { XpGainPopup } from "@/components/ui/XpGainPopup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  useCloneCrushStore,
  CompetitorVideo,
  ProfiledChannel,
  normalizeCloneCrushOutputLanguage,
  CONVEYOR_SIZE,
  FREE_GHOST_CACHE_SLOTS,
  PRO_GHOST_CACHE_SLOTS,
} from "@/stores/useCloneCrushStore";
import { useContentStore } from "@/stores/useContentStore";
import { useAuthStore, isProTier } from "@/stores/useAuthStore";
import { useTranscriptExtraction, useCloneCrushMutation } from "@/hooks/useSecureQuery";
import { useSoftGate } from "@/contexts/SoftGateContext";
import { useProUpgrade } from "@/contexts/ProUpgradeContext";
import { useWorkflowStore } from "@/stores/useWorkflowStore";
import { DailyLimitOverlay } from "@/components/showdown/DailyLimitOverlay";
import { FreeCooldownOverlay } from "@/components/showdown/FreeCooldownOverlay";
import { useQuotaStore } from "@/stores/useQuotaStore";
import { useCloneCrushQuota } from "@/hooks/useCloneCrushQuota";
import { EngineScriptLoop } from "@/components/scripts/EngineScriptLoop";
import { EntitlementStatus } from "@/components/subscription/EntitlementStatus";

type ProfileWithKeywords = ProfiledChannel & { extractedKeywords?: string[] };

function withClientTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId = 0;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(`Request timed out after ${Math.round(timeoutMs / 1000)} seconds`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId));
}

const VIRAL_VIEW_THRESHOLD = 50_000;
const PENDING_AUTH_WORKFLOW_KEY = "tc:clone-crush:pending-auth:v1";
const PENDING_AUTH_WORKFLOW_MAX_AGE_MS = 30 * 60 * 1000;

type CloneCrushStoreSnapshot = ReturnType<(typeof useCloneCrushStore)["getState"]>;
type PendingAuthWorkflowState = Pick<
  CloneCrushStoreSnapshot,
  | "profile"
  | "savedChannels"
  | "activeSlotIndex"
  | "savedNiche"
  | "outputLanguage"
  | "channelDraft"
  | "freeLockedChannelUrl"
  | "conveyorQueue"
  | "competitors"
  | "activeVideoId"
  | "conveyorCursor"
  | "conveyorWindowId"
  | "conveyorShiftPending"
  | "seenVideoIds"
  | "competitorsFetchedAt"
  | "envyMetrics"
  | "threatAlerts"
  | "wideningGap"
  | "freeCooldownUntil"
  | "freeLockedVideoId"
>;

type PendingAuthWorkflow = {
  version: 1;
  expiresAt: number;
  selectedVideoId: string;
  state: PendingAuthWorkflowState;
};

function createPendingAuthWorkflow(
  state: CloneCrushStoreSnapshot,
  selectedVideoId: string,
): PendingAuthWorkflow {
  return {
    version: 1,
    expiresAt: Date.now() + PENDING_AUTH_WORKFLOW_MAX_AGE_MS,
    selectedVideoId,
    state: {
      profile: state.profile,
      savedChannels: state.savedChannels,
      activeSlotIndex: state.activeSlotIndex,
      savedNiche: state.savedNiche,
      outputLanguage: state.outputLanguage,
      channelDraft: state.channelDraft,
      freeLockedChannelUrl: state.freeLockedChannelUrl,
      conveyorQueue: state.conveyorQueue,
      competitors: state.competitors,
      activeVideoId: state.activeVideoId,
      conveyorCursor: state.conveyorCursor,
      conveyorWindowId: state.conveyorWindowId,
      conveyorShiftPending: state.conveyorShiftPending,
      seenVideoIds: state.seenVideoIds,
      competitorsFetchedAt: state.competitorsFetchedAt,
      envyMetrics: state.envyMetrics,
      threatAlerts: state.threatAlerts,
      wideningGap: state.wideningGap,
      freeCooldownUntil: state.freeCooldownUntil,
      freeLockedVideoId: state.freeLockedVideoId,
    },
  };
}

function persistPendingAuthWorkflow(pending: PendingAuthWorkflow): void {
  try {
    window.sessionStorage.setItem(PENDING_AUTH_WORKFLOW_KEY, JSON.stringify(pending));
  } catch {
    // The in-memory snapshot still covers popup and email/password sign-in.
  }
}

function consumePendingAuthWorkflow(): PendingAuthWorkflow | null {
  try {
    const raw = window.sessionStorage.getItem(PENDING_AUTH_WORKFLOW_KEY);
    window.sessionStorage.removeItem(PENDING_AUTH_WORKFLOW_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingAuthWorkflow>;
    if (
      parsed.version !== 1 ||
      typeof parsed.expiresAt !== "number" ||
      parsed.expiresAt <= Date.now() ||
      typeof parsed.selectedVideoId !== "string" ||
      !parsed.state ||
      !Array.isArray(parsed.state.conveyorQueue) ||
      !parsed.state.conveyorQueue.some((video) => video?.videoId === parsed.selectedVideoId)
    ) {
      return null;
    }
    parsed.state.outputLanguage = normalizeCloneCrushOutputLanguage(parsed.state.outputLanguage);
    return parsed as PendingAuthWorkflow;
  } catch {
    return null;
  }
}

/** Restore only the workflow explicitly awaiting authentication, never the
 * guest's unrelated persisted stores. Returns false when its Slot 1 expired
 * while OAuth was in progress; the normal conveyor promotion then takes over. */
function restorePendingAuthWorkflow(pending: PendingAuthWorkflow): boolean {
  useCloneCrushStore.setState({
    ...pending.state,
    activeVideoId: pending.selectedVideoId,
  });
  if (pending.state.freeCooldownUntil && pending.state.freeCooldownUntil <= Date.now()) {
    useCloneCrushStore.getState().expireFreeCooldownCycle();
    return false;
  }
  return true;
}

function formatConveyorCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function clientViewCount(video: any): number {
  if (typeof video?.viewsCount === "number") return video.viewsCount;
  const text = String(video?.views || video?.viewsText || "").toLowerCase().replace(/,/g, "");
  const match = text.match(/([\d.]+)\s*(billion|million|thousand|b|m|k)?/);
  if (!match) return 0;
  const base = parseFloat(match[1]);
  const suffix = match[2] || "";
  const multiplier = suffix.startsWith("b") ? 1_000_000_000 : suffix.startsWith("m") ? 1_000_000 : (suffix.startsWith("k") || suffix.startsWith("thousand")) ? 1_000 : 1;
  return Number.isFinite(base) ? Math.round(base * multiplier) : 0;
}

export default function CloneCrush() {
  const navigate = useNavigate();
  const {
    runGuarded,
    requestAuthentication,
    isAuthLoading,
    isEntitlementLoading,
    isEntitlementVerified,
    isAuthenticated,
  } = useSoftGate();
  const { openProUpgrade } = useProUpgrade();

  // Synchronous cold-start hygiene: if the user reopens the page AFTER
  // their 24h cooldown has expired (offline/sleep across expiry), wipe
  // the persisted locked state synchronously so React never renders
  // yesterday's competitors/rewrites. Read is one-shot at module render
  // (not inside an effect) so the first paint is clean; the
  // auto-refresh effect below then populates a fresh matrix.
  (() => {
    const s = useCloneCrushStore.getState();
    if (s.freeCooldownUntil && s.freeCooldownUntil <= Date.now()) {
      s.expireFreeCooldownCycle();
    }
  })();

  const {
    profile, isProfiling, savedChannels, activeSlotIndex, savedNiche, competitors, conveyorQueue, isSearchingCompetitors, envyMetrics, threatAlerts, wideningGap, rewrites, isRewriting, activeRewrite,
    freeCooldownUntil, freeLockedVideoId, conveyorShiftPending, activeVideoId, conveyorCursor, conveyorWindowId, conveyorAppending, seenVideoIds,
    channelDraft, freeLockedChannelUrl, outputLanguage,
    setChannelDraft, submitChannelUrl, setOutputLanguage,
    setProfile, setIsProfiling, setSavedNiche, setCompetitors, setConveyorQueue, setActiveVideoId, setConveyorAppending, setIsSearchingCompetitors, setThreatAlerts, addRewrite, setIsRewriting, setActiveRewrite, deleteRewrite,
    startFreeCooldown, startFreeConveyorTimer, clearFreeCooldown, expireFreeCooldownCycle, appendConveyorTile, advanceAfterConsume, markConveyorShiftConsumed, markSeenVideo, beginNewWorkflow,
    saveChannelToCache, switchActiveSlot, removeChannelFromCache,
  } = useCloneCrushStore();

  // Active channel (primary URL) is the slot-0 Ghost Cache entry or the
  // currently-profiled channel's URL. Used for persistence and the
  // returning-user bootstrap flow.
  const activeSavedChannel = savedChannels.find((c) => c.slotIndex === activeSlotIndex) ?? savedChannels[0] ?? null;
  // Only submitted/saved URLs may trigger returning-user hydration. The
  // persisted draft is intentionally displayed but never auto-submitted.
  const lastChannelUrl = freeLockedChannelUrl || profile?.url || activeSavedChannel?.url || null;

  const saveContent = useContentStore((s) => s.saveContent);
  const savedContents = useContentStore((s) => s.contents);
  const incrementStat = useContentStore((s) => s.incrementStat);
  const license = useAuthStore((s) => s.license);
  // Never grant Premium behavior from a persisted snapshot until the active
  // session's entitlement has been authoritatively reconciled. While that
  // check is in flight (or failed), this screen fails safe to Free.
  const isTierReady = !isAuthLoading && !isEntitlementLoading;
  const isPro = isTierReady && isEntitlementVerified && isProTier(license);
  const isFreeChannelLocked = !isPro && !!freeLockedChannelUrl;
  const displayedChannelInput = isFreeChannelLocked
    ? (freeLockedChannelUrl ?? channelDraft)
    : channelDraft;

  // Live-ticking cooldown remaining (ms). Set from a 1s interval so the
  // UI overlays update in real time without triggering a full store
  // subscriber cascade every second. When the countdown hits zero the
  // store's expireFreeCooldownCycle() shifts the conveyor queue and
  // flips conveyorShiftPending so the append-one-niche-video effect
  // fires below.
  const [cooldownRemainingMs, setCooldownRemainingMs] = useState(() =>
    freeCooldownUntil ? Math.max(0, freeCooldownUntil - Date.now()) : 0,
  );
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!freeCooldownUntil) { setCooldownRemainingMs(0); return; }
    const tick = () => {
      const remaining = Math.max(0, (freeCooldownUntil ?? 0) - Date.now());
      setCooldownRemainingMs(remaining);
      if (remaining <= 0) {
        // Cycle the cooldown: evicts slot0 + its script, shifts
        // slot1→0/slot2→1, and sets conveyorShiftPending=true so the
        // auto-refresh effect can append one new niche-strict tile.
        expireFreeCooldownCycle();
        // Force a re-render so downstream effects see the shifted queue
        // immediately (persist writes are synchronous in zustand).
        setTick((n) => n + 1);
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [freeCooldownUntil, expireFreeCooldownCycle]);

  // A Free conveyor timer starts as soon as Slot 1 is exposed. Execution is
  // blocked only after that specific video has been consumed; the countdown
  // itself remains visible for the full 24-hour Slot 1 window.
  const isFreeConveyorActive = !isPro && !!freeCooldownUntil && freeCooldownUntil > Date.now();
  const isFreeCooldownActive = isFreeConveyorActive && !!freeLockedVideoId;
  const startWorkflowProfile = useWorkflowStore((s) => s.startProfile);
  const selectWorkflowCompetitor = useWorkflowStore((s) => s.selectCompetitor);
  const saveWorkflowPackage = useWorkflowStore((s) => s.saveContentPackage);
  const startWorkflowHandoff = useWorkflowStore((s) => s.startHandoff);

  // Both the unsubmitted draft and the submitted Free lock live in the
  // persisted Clone & Crush store so tab switches/focus changes cannot reset
  // or silently replace the target URL.
  const [nicheInput, setNicheInput] = useState<string>(() => savedNiche ?? "");
  const [customDescription, setCustomDescription] = useState("");

  // selectedVideo is derived from conveyorQueue + activeVideoId. The queue
  // is the source of truth so the 24h conveyor shift can change the
  // actionable slot without UI state getting out of sync.
  const selectedVideo: CompetitorVideo | null = (() => {
    // A persisted Pro selection may point at a later tile after downgrade or
    // entitlement hydration. Free must always resolve to the one actionable
    // Slot 1 so stale activeVideoId state can never turn its first click into a
    // locked/Pro-only action.
    if (!isPro) return competitors[0] ?? null;
    if (activeVideoId) return competitors.find((v) => v.videoId === activeVideoId) ?? competitors[0] ?? null;
    return competitors[0] ?? null;
  })();
  const [selectedTier, setSelectedVideoTier] = useState<"free" | "premium">(isPro ? "premium" : "free");
  const [copiedText, setCopiedText] = useState(false);
  const [activeTab, setActiveTab] = useState("script");
  const [logSteps, setLogSteps] = useState<{ label: string; status: "pending" | "processing" | "success" | "rerouting" | "error"; meta?: string }[]>([]);
  const [burstTrigger, setBurstTrigger] = useState(0);
  const [xpTrigger, setXpTrigger] = useState(0);
  const [workflowNonce, setWorkflowNonce] = useState(0);
  const [dailyLimitActive, setDailyLimitActive] = useState(false);

  const activePackageLibraryTitle = activeRewrite
    ? `Chain-Loop: ${activeRewrite.rewrittenTitle.substring(0, 35)}...`
    : "";
  const isActivePackageSaved = Boolean(
    activePackageLibraryTitle && savedContents.some((item) => item.title === activePackageLibraryTitle),
  );
  const activePackageText = activeRewrite
    ? `TITLE: ${activeRewrite.rewrittenTitle}\nHOOK: ${activeRewrite.glitchHook}\nSCRIPT:\n${activeRewrite.fullScript}\n\nTHUMBNAIL PROMPT: ${activeRewrite.thumbnailPrompt}\nSEO TAGS: ${(activeRewrite.seoTags || []).join(", ")}\nEDITING GUIDE: ${activeRewrite.editingGuide}`
    : "";

  const transcriptMutation = useTranscriptExtraction();
  const cloneCrushMutation = useCloneCrushMutation();
  const { quota: dailyQuota, isBlocked: dailyLimitBlocked, refresh: refreshQuota } = useCloneCrushQuota();

  // Double-click / StrictMode guard across renders.
  const isExecutingRef = useRef(false);
  const pendingAuthResumeVideoIdRef = useRef<string | null>(null);
  const [pendingAuthResumeNonce, setPendingAuthResumeNonce] = useState(0);

  // Single paywall route helper — opens the central Pro Upgrade modal
  // (Payment vs Referral choice) instead of force-redirecting to /rewards.
  // Resets selectedTier to "free" so the user isn't stranded on the 99% card.
  const routeToProUpsell = useCallback((reason: "premium" | "locked" | "channel" | "interrogate" | "squad" = "premium") => {
    setSelectedVideoTier("free");
    openProUpgrade({ defaultTab: "payment", reason });
  }, [openProUpgrade]);

  // Premium access is allowed only after the current session's entitlement
  // verification completed. Reading the latest license here still protects
  // click handlers from stale render closures.
  const canUsePremium = useCallback((): boolean => {
    if (!isTierReady || !isEntitlementVerified) return false;
    return isProTier(useAuthStore.getState().license);
  }, [isEntitlementVerified, isTierReady]);

  // Paywall gate — single source of truth. Called at click-time AND at the
  // top of performCloneAndCrush. Returns true if user was bounced.
  const enforcePremiumPaywall = useCallback((): boolean => {
    if (canUsePremium()) return false;
    if (selectedTier === "premium") { routeToProUpsell("premium"); return true; }
    if (selectedVideo?.isLocked) { routeToProUpsell("locked"); return true; }
    return false;
  }, [canUsePremium, selectedTier, selectedVideo, routeToProUpsell]);

  // Keep selectedTier in lockstep with live entitlement. Free users can
  // NEVER be on the premium tier — downgrade them instantly.
  useEffect(() => {
    if (!isPro) setSelectedVideoTier("free");
  }, [isPro]);

  // Becoming Pro instantly clears the free-tier 24h cooldown so the
  // paywall upgrade is the documented bypass and users can immediately
  // start a new workflow.
  useEffect(() => {
    if (isPro && (freeCooldownUntil || freeLockedVideoId)) clearFreeCooldown();
  }, [isPro, freeCooldownUntil, freeLockedVideoId, clearFreeCooldown]);

  // On reload / rehydration during an active cooldown, force the
  // originally-locked video as activeVideoId so the "LOCKED" result
  // panel renders exactly where the user left off. Also restore the
  // rewrite result panel for the locked video if we have it in history.
  useEffect(() => {
    if (!isFreeCooldownActive) return;
    const lockedVideo = competitors.find((v) => v.videoId === freeLockedVideoId);
    if (lockedVideo && activeVideoId !== lockedVideo.videoId) {
      setActiveVideoId(lockedVideo.videoId);
    }
    const lockedRewrite = rewrites.find((r) => r.targetVideoId === freeLockedVideoId);
    if (lockedRewrite && activeRewrite?.id !== lockedRewrite.id) {
      setActiveRewrite(lockedRewrite);
      setActiveTab("script");
    }
  }, [isFreeCooldownActive, competitors, freeLockedVideoId, rewrites, activeVideoId, activeRewrite?.id, setActiveVideoId, setActiveRewrite]);

  useEffect(() => {
    setDailyLimitActive(!isPro && dailyQuota.allowed === false && (dailyQuota.remainingSeconds ?? 0) > 0);
  }, [isPro, dailyQuota.allowed, dailyQuota.remainingSeconds]);

  useEffect(() => {
    if (profile) {
      if (!nicheInput) {
        const desc = profile.description.toLowerCase();
        if (desc.includes("crypto") || desc.includes("bitcoin")) setNicheInput("Crypto & Finance");
        else if (desc.includes("tech") || desc.includes("coding") || desc.includes("software")) setNicheInput("Tech & Coding");
        else if (desc.includes("vlog") || desc.includes("travel")) setNicheInput("Lifestyle Vlogging");
        else if (desc.includes("cooking") || desc.includes("food")) setNicheInput("Culinary & Cooking");
        else if (desc.includes("business") || desc.includes("marketing")) setNicheInput("Business & Wealth");
        else setNicheInput("Educational Tutorials");
      }
      if (!customDescription) setCustomDescription(profile.description.slice(0, 150) + "...");
    }
  }, [profile]); // eslint-disable-line react-hooks/exhaustive-deps

  // Daily Conveyor Belt orchestrator. Two responsibilities:
  //  (A) On conveyorShiftPending (24h cooldown expired in-place OR
  //      stale-reload), fetch ONE new niche-strict video via the
  //      cursor-based /api/clone-crush competitors endpoint and append
  //      it so the queue is exactly 3 again — slot0 evicted, slot1→0
  //      unlocked, slot2→1 locked, slot3 fresh teaser.
  //  (B) On returning-user cold start with a saved channel in the
  //      Ghost Cache but no profile in memory, re-profile in the
  //      background so the dashboard is ready instantly.
  const autoRefreshRunningRef = useRef(false);
  const conveyorRetryBlockedRef = useRef(false);
  const conveyorRetryTimerRef = useRef<number | null>(null);
  const [conveyorRetryNonce, setConveyorRetryNonce] = useState(0);

  useEffect(() => () => {
    if (conveyorRetryTimerRef.current !== null) {
      window.clearTimeout(conveyorRetryTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (isRewriting || isProfiling || isSearchingCompetitors || conveyorAppending) return;

    // Pro users don't participate in the 24h cooldown shift (they
    // advance inline on success). If a stale flag somehow persists,
    // clear it.
    if (isPro) {
      if (conveyorShiftPending) markConveyorShiftConsumed();
    }

    // Case A: cooldown expired — append one video to fill slot3.
    if (conveyorShiftPending && !isFreeCooldownActive && !isPro) {
      if (autoRefreshRunningRef.current || conveyorRetryBlockedRef.current) return;
      autoRefreshRunningRef.current = true;
      setActiveRewrite(null);
      setLogSteps([]);
      setActiveTab("script");
      setCopiedText(false);
      setDailyLimitActive(false);
      toast.loading("24h conveyor advanced • sourcing next niche trend...", { id: "conveyor-shift" });
      void refreshQuota(true).catch(() => {});
      const strictNiche = savedNiche || nicheInput || "General YouTube Content";
      const state0 = useCloneCrushStore.getState();
      const excludeIds = Array.from(new Set([...(state0.seenVideoIds || []), ...state0.conveyorQueue.map(v => v.videoId)]));
      cloneCrushMutation
        .mutateAsync({
          action: "competitors",
          niche: strictNiche,
          description: strictNiche,
          language: outputLanguage,
          limit: 3,
          after: state0.conveyorCursor,
          windowId: state0.conveyorWindowId,
          excludeIds,
        })
        .then((res: any) => {
          if (!res?.success || !Array.isArray(res.competitors)) throw new Error(res?.error || "append failed");
          const viral = (res.competitors as any[]).filter((v: any) => clientViewCount(v) >= VIRAL_VIEW_THRESHOLD);
          const fresh = viral.find((v: any) => v?.videoId && !excludeIds.includes(v.videoId));
          // Advance the search cursor even when this page contains no fresh
          // video, otherwise every retry would request the same exhausted page.
          useCloneCrushStore.setState({
            conveyorCursor: res.nextCursor || null,
            conveyorWindowId: res.windowId || state0.conveyorWindowId,
          });
          if (!fresh) throw new Error("No fresh analysis available — try again in a moment");

          appendConveyorTile(fresh as CompetitorVideo);
          markSeenVideo(fresh.videoId);
          const nextQueue = useCloneCrushStore.getState().conveyorQueue;
          if (nextQueue[0]?.videoId) setActiveVideoId(nextQueue[0].videoId);
          // Consume the persisted pending flag only after a real replacement
          // tile has been appended. Failed/empty requests must remain retryable.
          markConveyorShiftConsumed();
          toast.success("New slot unlocked", { id: "conveyor-shift" });
        })
        .catch((error: unknown) => {
          console.warn("[clone-crush] Conveyor refill failed:", error instanceof Error ? error.message : String(error));
          toast.error("Refill delayed — retrying automatically", { id: "conveyor-shift" });
          conveyorRetryBlockedRef.current = true;
          if (conveyorRetryTimerRef.current !== null) {
            window.clearTimeout(conveyorRetryTimerRef.current);
          }
          conveyorRetryTimerRef.current = window.setTimeout(() => {
            conveyorRetryTimerRef.current = null;
            conveyorRetryBlockedRef.current = false;
            setConveyorRetryNonce((nonce) => nonce + 1);
          }, 15_000);
        })
        .finally(() => {
          autoRefreshRunningRef.current = false;
          setConveyorAppending(false);
        });
      return;
    }

    // Case B: returning user with a saved URL but no profile.
    if (!profile && lastChannelUrl && isTierReady && !conveyorShiftPending) {
      if (autoRefreshRunningRef.current) return;
      autoRefreshRunningRef.current = true;
      toast.loading("Reconnecting to your saved channel…", { id: "returning-profile" });
      setIsProfiling(true);
      cloneCrushMutation
        .mutateAsync({ action: "profile", channelUrl: lastChannelUrl, language: outputLanguage })
        .then((res: any) => {
          if (!res?.success || !res.profile) throw new Error(res?.error || "Profile unavailable");
          const profiledChannel: ProfileWithKeywords = {
            ...res.profile,
            extractedKeywords: res.extractedKeywords || res.profile.extractedKeywords || [],
            slotIndex: activeSlotIndex,
          };
          setProfile(profiledChannel, lastChannelUrl);
          startWorkflowProfile({ id: profiledChannel.id, name: profiledChannel.name, handle: profiledChannel.handle, avatar: profiledChannel.avatar });
          toast.success(`Reconnected to ${profiledChannel.name}`, { id: "returning-profile" });
          // A migrated/reloaded workspace may retain its conveyor while profile
          // metadata is absent. Rehydrate the profile without replacing that
          // active 24-hour queue or restarting Slot 1's timer.
          if (useCloneCrushStore.getState().conveyorQueue.length > 0) return;
          return autoDiscoverCompetitors(profiledChannel);
        })
        .catch(() => {
          toast.dismiss("returning-profile");
        })
        .finally(() => {
          autoRefreshRunningRef.current = false;
          setIsProfiling(false);
        });
    }
    // autoDiscoverCompetitors and the mutation wrapper are intentionally
    // omitted: both are recreated during render, while the explicit state
    // guards above make this effect the single conveyor/bootstrap trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    conveyorShiftPending, conveyorAppending, conveyorRetryNonce, profile, isFreeCooldownActive, isPro, lastChannelUrl,
    savedNiche, nicheInput, outputLanguage, seenVideoIds, conveyorCursor, conveyorWindowId, activeSlotIndex,
    isTierReady, isRewriting, isProfiling, isSearchingCompetitors,
    markConveyorShiftConsumed, refreshQuota, setProfile, setIsProfiling,
    startWorkflowProfile, appendConveyorTile, setActiveVideoId, markSeenVideo,
    setConveyorAppending,
  ]);

  const autoDiscoverCompetitors = async (prof: ProfileWithKeywords) => {
    const extractedKeywords = Array.isArray(prof.extractedKeywords) ? prof.extractedKeywords.filter((k: unknown) => typeof k === "string" && k.trim()).slice(0, 8) : [];
    const keywordContext = extractedKeywords.join(" ");
    const desc = `${prof.description || ""} ${prof.name || ""} ${keywordContext}`.toLowerCase();
    let deducedNiche = "General YouTube Content";
    if (desc.includes("crypto") || desc.includes("bitcoin") || desc.includes("finance") || desc.includes("trading") || desc.includes("money")) deducedNiche = "Crypto & Finance";
    else if (desc.includes("tech") || desc.includes("coding") || desc.includes("software") || desc.includes("ai") || desc.includes("programming")) deducedNiche = "Tech & Coding";
    else if (desc.includes("vlog") || desc.includes("travel") || desc.includes("lifestyle") || desc.includes("daily")) deducedNiche = "Lifestyle Vlogging";
    else if (desc.includes("cooking") || desc.includes("food") || desc.includes("recipe")) deducedNiche = "Culinary & Cooking";
    else if (desc.includes("business") || desc.includes("marketing") || desc.includes("startup") || desc.includes("entrepreneur")) deducedNiche = "Business & Wealth";
    else if (desc.includes("gaming") || desc.includes("gameplay") || desc.includes("streamer")) deducedNiche = "Gaming & Esports";
    else if (desc.includes("education") || desc.includes("tutorial") || desc.includes("learn")) deducedNiche = "Educational Tutorials";
    else if (extractedKeywords.length > 0) deducedNiche = extractedKeywords.slice(0, 4).join(" ");
    else deducedNiche = prof.name || "Trending Creator Content";

    const discoveryDescription = [prof.description, keywordContext].filter(Boolean).join(" ").trim() || deducedNiche;
    setNicheInput(deducedNiche);
    // Persist the deduced niche so EVERY future conveyor shift /
    // auto-refresh stays strictly within this category — zero-friction
    // niche-strict targeting from the saved URL.
    setSavedNiche(deducedNiche);
    setCustomDescription((prof.description || discoveryDescription).slice(0, 150));
    setIsSearchingCompetitors(true);
    toast.loading(`Analyzing "${deducedNiche}" and auditing what is working...`, { id: "competitors-find" });

    try {
      // Bootstrap the sliding window — request 3 tiles with no cursor.
      // Future shifts request 1 tile at a time with the returned nextCursor.
      const res = await cloneCrushMutation.mutateAsync({
        action: "competitors",
        niche: deducedNiche,
        description: discoveryDescription,
        language: outputLanguage,
        limit: CONVEYOR_SIZE,
        excludeIds: [],
      });
      if (res.success && res.competitors) {
        const viralCompetitors = res.competitors.filter((v: any) => clientViewCount(v) >= VIRAL_VIEW_THRESHOLD);
        if (viralCompetitors.length === 0) throw new Error("No 50k+ viral competitors found");
        const envyData = (res as any).envyMetrics || null;
        setCompetitors(viralCompetitors, envyData, { nextCursor: res.nextCursor ?? null, windowId: res.windowId ?? null });
        const unlocked = canUsePremium()
          ? (viralCompetitors.find((v: any) => !v.isLocked) || viralCompetitors[0])
          : viralCompetitors[0];
        setActiveVideoId(unlocked?.videoId ?? null);
        if (!canUsePremium() && unlocked?.videoId) startFreeConveyorTimer();
        viralCompetitors.forEach((v: any) => markSeenVideo(v.videoId));
        selectWorkflowCompetitor({ videoId: unlocked.videoId, title: unlocked.title, url: unlocked.url, channelName: unlocked.channelName, thumbnail: unlocked.thumbnail }, deducedNiche);
        const isGhost = (res as any).ghostReconstructed;
        toast.success(isGhost ? `Analysis ready — ${viralCompetitors.length} viral competitors found` : `Analysis ready — ${viralCompetitors.length} 50k+ competitors found`, { id: "competitors-find" });
        cloneCrushMutation.mutateAsync({ action: "threat-alerts", competitors: viralCompetitors, userSubscribers: prof.subscriberCount || 0, language: outputLanguage }).then((alertRes: any) => {
          if (alertRes.success) setThreatAlerts(alertRes.alerts || [], alertRes.wideningGap || null);
        }).catch(() => {});
      } else throw new Error(res.error || "No competitors");
    } catch (err: any) {
      // Even on error, ghost synthetic should have returned - but fallback toast
      toast.error(err.message || "Showing cached analysis while we retry", { id: "competitors-find" });
    } finally { setIsSearchingCompetitors(false); }
  };

  const performProfileChannel = async () => {
    if (!isTierReady) {
      toast.loading("Verifying account clearance...", { id: "tier-readiness" });
      return;
    }

    const input = displayedChannelInput.trim();
    if (!input) { toast.error("Please enter a YouTube Channel URL or Handle"); return; }

    // runGuarded may resume this render-local callback after a guest signs in.
    // Entitlement reconciliation has completed by then, so read the live
    // license rather than the anonymous render's captured isPro value. Carry
    // the explicitly selected language into the new user's scoped store too.
    const userIsPro = canUsePremium();
    setOutputLanguage(outputLanguage);

    // Atomically persist the exact submitted URL before any reset or network
    // work. The first Free submission becomes immutable; changing it can only
    // proceed after the existing Pro paywall.
    const submission = submitChannelUrl(input, userIsPro ? "pro" : "free");
    if (!submission.ok) {
      if (submission.reason === "URL_LOCKED") routeToProUpsell("channel");
      else toast.error("Please enter a YouTube Channel URL or Handle");
      return;
    }

    // Free users get one active Slot 1 window. Re-profiling would replace the
    // queue and restart that window, so keep the current result stable.
    if (!userIsPro && isFreeConveyorActive) {
      routeToProUpsell("locked");
      return;
    }

    // Atomic store reset BEFORE async work so stale competitors/rewrites don't
    // bleed into the new scan. Local UI state is reset alongside it, and the
    // keyed panel below forces React to unmount/remount the competitor matrix.
    beginNewWorkflow();
    setActiveVideoId(null);
    setLogSteps([]);
    setActiveTab("script");
    setCopiedText(false);
    setBurstTrigger(0);
    setXpTrigger(0);
    setNicheInput("");
    setCustomDescription("");
    setWorkflowNonce((n) => n + 1);
    setDailyLimitActive(false);
    setIsProfiling(true);
    // Persist the URL the user submitted into slot-0 Ghost Cache BEFORE
    // async work so a crash or navigation during profiling still
    // remembers the channel next visit. Free users only have slot 0;
    // Pro users can stack up to 5.
    const saveResult = saveChannelToCache(
      { url: input, handle: input, name: input, avatar: "", niche: null },
      activeSlotIndex,
      userIsPro ? "pro" : "free",
    );
    if (!saveResult.ok) {
      setIsProfiling(false);
      if (saveResult.reason === "URL_LOCKED") routeToProUpsell("channel");
      else toast.error("Saved channel limit reached — Pro supports up to 5 saved channels", { id: "ghost-cache-limit" });
      return;
    }
    toast.loading("Establishing ghost tunnel to YouTube veil layer...", { id: "profile-scrape" });
    try {
      const profileRequest = cloneCrushMutation.mutateAsync({ action: "profile", channelUrl: input, language: outputLanguage });
      const res = await withClientTimeout(profileRequest, 15_000);
      if (res.success && res.profile) {
        const profileResponse = res as typeof res & { extractedKeywords?: string[] };
        const profiledChannel: ProfileWithKeywords = { ...res.profile, extractedKeywords: profileResponse.extractedKeywords || res.profile.extractedKeywords || [] };
        setProfile(profiledChannel, input);
        startWorkflowProfile({ id: profiledChannel.id, name: profiledChannel.name, handle: profiledChannel.handle, avatar: profiledChannel.avatar });
        const isGhost = (res as any).ghostReconstructed;
        toast.success(isGhost ? `Profile loaded: ${profiledChannel.name}` : `Profile loaded: ${profiledChannel.name}`, { id: "profile-scrape" });
        await autoDiscoverCompetitors(profiledChannel);
      } else throw new Error(res.error || "Channel not found");
    } catch (err: any) {
      toast.error(err.message || "Ghost scrape - using encrypted reconstruction", { id: "profile-scrape" });
    } finally { setIsProfiling(false); }
  };

  const handleProfileChannel = () => {
    if (!displayedChannelInput.trim()) return performProfileChannel();
    return runGuarded("profile another channel", performProfileChannel);
  };

  const performCloneAndCrush = async () => {
    if (!selectedVideo) { toast.error("Select a competitor video from matrix"); return; }

    // Double-click / StrictMode guard.
    if (isExecutingRef.current) return;
    isExecutingRef.current = true;

    // steps is declared in function scope so the catch/finally blocks can
    // reference it even when an error throws mid-pipeline.
    let steps: { label: string; status: "pending" | "processing" | "success" | "rerouting" | "error"; meta?: string }[] = [];

    // Authoritative pro check — reads live store via isProTier (rejects stale
    // localStorage snapshots), not a render-closure boolean.
    const userIsPro = canUsePremium();

    // HARD PREFLIGHT — premium paywall. Re-runs inside performCloneAndCrush
    // so even if runGuarded() invokes us after a microtask / auth-popup
    // resolution (or if entitlement changed between click and invoke), we
    // still bounce.
    if (enforcePremiumPaywall()) {
      isExecutingRef.current = false;
      return;
    }

    // WIPE STATE AT THE MILLISECOND A NEW EXECUTION STARTS. The old
    // activeRewrite / console / copy state is dropped synchronously so a
    // previously-generated package never bleeds over the new run.
    setActiveRewrite(null);
    setLogSteps([]);
    setCopiedText(false);
    setActiveTab("script");

    // Free-tier daily-limit short-circuit. Check BEFORE we set isRewriting or
    // populate logSteps so no fake console animation paints on blocked runs.
    if (!userIsPro) {
      try { await refreshQuota(true); } catch { /* server enforcement still applies */ }
      const q = useQuotaStore.getState();
      if (!q.allowed && q.remainingSeconds > 0) {
        isExecutingRef.current = false;
        setDailyLimitActive(true);
        setIsRewriting(false);
        toast.error("Daily free limit reached — unlock Pro for unlimited Chain-Loops", { id: "daily-limit" });
        return;
      }
    }

    // --- AUTHORIZATION PHASE ---------------------------------------------
    // The server is authoritative for premium entitlement. We downgrade
    // non-pro users to the free tier client-side (so they can never ship a
    // tier="premium" request that the server has to reject) and start the
    // console only after we've set up the steps array.
    const requestedTier: "free" | "premium" = userIsPro ? selectedTier : "free";
    setIsRewriting(true);

    try {
      // Fire the rewrite. The server will 401/403 if a non-pro user
      // smuggled tier=premium; we treat those as paywall signals, not
      // "recovered" successes.
      let transcriptData: any;
      try {
        transcriptData = await withClientTimeout((transcriptMutation.mutateAsync as any)({ url: selectedVideo.url, title: selectedVideo.title }), 8_000);
      } catch (err: any) {
        transcriptData = { transcript: `Ghost reconstructed scaffold for ${selectedVideo.title}: High-retention script about ${nicheInput}. Hook, open loop, value, payoff loop.`, source: "ghost-local", ghostNode: "LOCAL-SYNTH" };
      }

      if (!transcriptData?.transcript || transcriptData.transcript.length < 10) {
        transcriptData.transcript = `Ghost scaffold for ${selectedVideo.title}: viral script about ${nicheInput}`;
      }

      steps = [
        { label: "Fetching video data…", status: "processing", meta: "secure" },
        { label: `Arming ${requestedTier === "premium" ? "99% GLITCH PROTOCOL" : "60% Standard Optimization"}...`, status: "pending", meta: "ARMING" },
        { label: "Scraping Captions via Ghost Relay Mesh (6 nodes)...", status: "pending", meta: "PIPED MESH" },
        { label: "Enforcing Stealth Disguise & Anti-Clone Shield...", status: "pending", meta: "STEALTH" },
        { label: `Injecting ${requestedTier === "premium" ? "EXTREME Curiosity Glitch" : "Curiosity"} into Title & Hook...`, status: "pending", meta: "GLITCH" },
        { label: "Reverse-Engineering Viral Thumbnail DNA...", status: "pending", meta: "THEFT ENGINE" },
        { label: "Compiling Chain-Loop (5 Viral Assets Package)...", status: "pending", meta: "CHAIN-LOOP" },
      ];
      setLogSteps(steps);
      steps[0].status = "success"; steps[0].meta = transcriptData.source?.includes("ghost") ? "transcripts • cached" : "transcripts • live"; steps[1].status = "processing"; setLogSteps([...steps]); await new Promise(r=>setTimeout(r,400));
      steps[1].status = "success"; steps[2].status = steps[0].meta.includes("SYNTH") ? "rerouting" : "processing"; steps[2].meta = steps[0].meta.includes("SYNTH") ? "GHOST RECONSTRUCT" : "PIPED MESH"; setLogSteps([...steps]); if (steps[2].status === "rerouting") await new Promise(r=>setTimeout(r,300));
      steps[2].status = "success"; steps[2].meta = transcriptData.source?.includes("ghost") ? "captions • cached" : "captions • live"; steps[3].status = "processing"; setLogSteps([...steps]); await new Promise(r=>setTimeout(r,300));
      steps[3].status = "success"; steps[4].status = "processing"; setLogSteps([...steps]);

      const rewriteRes = await withClientTimeout(cloneCrushMutation.mutateAsync({
        action: "rewrite",
        targetVideoId: selectedVideo.videoId,
        originalTranscript: transcriptData.transcript,
        originalTitle: selectedVideo.title,
        niche: nicheInput,
        tier: requestedTier,
        language: outputLanguage,
      }), 55_000);
      steps[4].status = "success"; steps[5].status = "processing"; setLogSteps([...steps]);

      if (rewriteRes.success && rewriteRes.rewrite) {
        const rw = rewriteRes.rewrite;
        let reverseEngineeredPrompts: string[] = []; let reverseEngineeredSource: any = null;
        try {
          const reverseRes = await withClientTimeout(cloneCrushMutation.mutateAsync({ action: "thumbnail-reverse", glitchTitle: rw.rewrittenTitle, niche: nicheInput, tier: requestedTier, language: outputLanguage }), 18_000);
          const reverseData = reverseRes as any;
          if (reverseData.success && reverseData.thumbnailPrompts) { reverseEngineeredPrompts = reverseData.thumbnailPrompts; reverseEngineeredSource = reverseData.sourceVideo || null; }
        } catch {
          // Thumbnail reverse-engineering is optional; keep the core rewrite.
        }
        steps[5].status = "success"; steps[6].status = "processing"; setLogSteps([...steps]); await new Promise(r=>setTimeout(r,250));
        const savedRewrite = addRewrite({
          outputLanguage,
          targetVideoId: selectedVideo.videoId, targetVideoTitle: selectedVideo.title, originalTitle: rw.originalTitle, rewrittenTitle: rw.rewrittenTitle, glitchHook: rw.glitchHook, fullScript: rw.fullScript, retentionKeywordsUsed: rw.retentionKeywordsUsed, seoTags: rw.seoTags, thumbnailPrompt: rw.thumbnailPrompt, editingGuide: rw.editingGuide, tier: rw.tier || requestedTier, isStealthDisguised: true, changedAnalogiesCount: rw.changedAnalogiesCount, changedExamplesCount: rw.changedExamplesCount, glitchTechniques: rw.glitchTechniques, glitchIntensity: rw.glitchIntensity || (requestedTier === "premium" ? 99 : 60), reverseEngineeredPrompts, reverseEngineeredSource,
        });
        const promptCount = reverseEngineeredPrompts.length || 1;
        saveWorkflowPackage({ rewriteId: savedRewrite.id, title: rw.rewrittenTitle, fullScript: rw.fullScript, thumbnailPrompt: rw.thumbnailPrompt, seoTags: rw.seoTags || [] });
        const achievedTier: "free"|"premium" = (rw.tier === "premium") ? "premium" : requestedTier;
        saveContent({ type: "script", title: `Chain-Loop: ${rw.rewrittenTitle.substring(0,35)}...`, content: `GLITCH ${rw.glitchIntensity||(achievedTier==="premium"?99:60)}% | TITLE: ${rw.rewrittenTitle} | HOOK: ${rw.glitchHook} | SCRIPT: ${rw.fullScript} | PROMPTS: ${reverseEngineeredPrompts.length>0?reverseEngineeredPrompts.join('\\n'):rw.thumbnailPrompt} | GUIDE: ${rw.editingGuide}`, metadata: { platform: "YouTube", style: achievedTier === "premium" ? "99% Glitch" : "60% Standard" } });
        incrementStat("scriptsGenerated");
        steps[6].status = "success"; steps[6].meta = "5 ASSETS • SECURED"; setLogSteps([...steps]);
        setBurstTrigger(v => v + 1);
        setXpTrigger(v => v + 1);
        if (navigator.vibrate) navigator.vibrate([20, 30, 20]);
        try { const s = JSON.parse(localStorage.getItem("ghost_streak_v2") || "{}"); const xp = (s.xp || 0) + 30; const streak = s.streak || 1; localStorage.setItem("ghost_streak_v2", JSON.stringify({ ...s, xp, streak, lastDate: new Date().toDateString() })); } catch {
          // Streak telemetry must never block a successful generation.
        }
        toast.success(`🚀 ${achievedTier==="premium"?"99% GLITCH":"60% Standard"} Chain-Loop Secured via Ghost Node • ${promptCount} prompts • +30 XP`);

        // --- SLIDING CONVEYOR ADVANCE ----------------------------------
        // After a successful Chain-Loop the consumed slot0 is evicted
        // permanently, the queue shifts (slot1→0 unlocked, slot2→1
        // locked), and we fetch ONE new niche-strict video to fill the
        // empty slot3. Pro users get the next tile instantly (zero
        // cooldown = "Skip Wait"); free users have slot0 pinned for 24h
        // with the result on screen, and the slide happens when the
        // cooldown ticker fires expireFreeCooldownCycle().
        if (userIsPro) {
          // Kick a single-video append against the strict niche so the
          // queue slides from [1,2,3] → [2,3,4] and the next actionable
          // slot unlocks instantly.
          setConveyorAppending(true);
          const strictNiche = savedNiche || nicheInput || "General YouTube Content";
          const excludeIds = Array.from(new Set([...seenVideoIds, ...conveyorQueue.map(v => v.videoId)]));
          const windowId = conveyorWindowId || undefined;
          cloneCrushMutation
            .mutateAsync({ action: "competitors", niche: strictNiche, description: strictNiche, language: outputLanguage, limit: 3, excludeIds, windowId, after: conveyorCursor })
            .then((res: any) => {
              if (!res?.success || !Array.isArray(res.competitors)) throw new Error(res?.error || "append failed");
              const viral = (res.competitors as any[]).filter((v: any) => clientViewCount(v) >= VIRAL_VIEW_THRESHOLD);
              const fresh = viral.find((v: any) => v?.videoId && !excludeIds.includes(v.videoId));
              advanceAfterConsume(fresh as CompetitorVideo | null, res.nextCursor || null);
              if (fresh) markSeenVideo(fresh.videoId);
              toast.success("⚡ BLACK-OP LANE • Next conveyor slot unlocked", { id: "conveyor-advance" });
            })
            .catch(() => {
              // Even if the append fails, shift locally so the UI never
              // blocks; next effect tick will retry.
              advanceAfterConsume(null, conveyorCursor);
            })
            .finally(() => setConveyorAppending(false));
        } else {
          // Free-tier monetization lock: after a successful run the
          // result stays LOCKED on screen for 24h. The cooldown
          // timestamp is persisted per-user so the timer & locks
          // survive reload. When the timer hits zero,
          // expireFreeCooldownCycle() shifts the queue and the
          // conveyorShiftPending effect below appends the next tile.
          startFreeCooldown(selectedVideo.videoId);
          void refreshQuota(true);
        }
      } else if ((rewriteRes as any).code === "DAILY_LIMIT") {
        // Server-authoritative: free user burned their run today.
        const limitRes = rewriteRes as any;
        useQuotaStore.getState().setQuota({
          allowed: false,
          tier: "free",
          usedToday: 1,
          limit: 1,
          remaining: 0,
          resetAt: typeof limitRes.resetAt === "string" ? limitRes.resetAt : null,
          remainingSeconds: typeof limitRes.remainingSeconds === "number" ? limitRes.remainingSeconds : 24 * 3600,
        });
        setDailyLimitActive(true);
        setLogSteps([]);
        setIsRewriting(false);
        toast.error("Daily free limit reached — see Pro options for more package access", { id: "daily-limit" });
        return;
      } else {
        const code = (rewriteRes as any).code;
        const status = (rewriteRes as any).status;
        if (code === "AUTH_REQUIRED" || status === 401) {
          setActiveRewrite(null);
          setLogSteps([]);
          setIsRewriting(false);
          isExecutingRef.current = false;
          toast.error("Sign in to complete your Free Chain-Loop", { id: "clone-crush-auth" });
          void requestAuthentication("complete your Free Chain-Loop");
          return;
        }
        if (code === "PRO_REQUIRED" || (status === 403 && requestedTier === "premium")) {
          setActiveRewrite(null);
          setLogSteps([]);
          setIsRewriting(false);
          isExecutingRef.current = false;
          routeToProUpsell("premium");
          return;
        }
        throw new Error((rewriteRes as any).error || "Compilation interference");
      }
    } catch (err: unknown) {
      const errCode = (err as any)?.code;
      const errStatus = (err as any)?.status;
      if (errCode === "AUTH_REQUIRED" || errStatus === 401) {
        setActiveRewrite(null);
        setLogSteps([]);
        setIsRewriting(false);
        isExecutingRef.current = false;
        toast.error("Sign in to complete your Free Chain-Loop", { id: "clone-crush-auth" });
        void requestAuthentication("complete your Free Chain-Loop");
        return;
      }
      if (errCode === "PRO_REQUIRED" || (errStatus === 403 && requestedTier === "premium")) {
        setActiveRewrite(null);
        setLogSteps([]);
        setIsRewriting(false);
        isExecutingRef.current = false;
        routeToProUpsell("premium");
        return;
      }
      if (errStatus === 403) {
        setActiveRewrite(null);
        setLogSteps([]);
        toast.error("This request could not be authorized. Please refresh and try again.", { id: "clone-crush-forbidden" });
        return;
      }
      if (errCode === "DAILY_LIMIT" || errCode === 402) {
        setDailyLimitActive(true);
        void refreshQuota(true);
        toast.error("Daily free limit reached — see Pro options", { id: "daily-limit" });
        setIsRewriting(false);
        isExecutingRef.current = false;
        return;
      }
      // Genuine transport failure — mark remaining steps as recovered so
      // the UI doesn't hang on a spinner, but do NOT claim success on a
      // paywall/auth failure (those cases are handled above).
      const recovered = steps.map((s) =>
        s.status === "processing" || s.status === "pending"
          ? { ...s, status: "success" as const, meta: s.meta || "RECOVERED" }
          : s,
      );
      setLogSteps(recovered);
      console.warn("[clone-crush] Chain-Loop transport error:", err instanceof Error ? err.message : String(err));
    } finally {
      setIsRewriting(false);
      isExecutingRef.current = false;
    }
  };

  const handleSendToVoiceover = () => { if (!activeRewrite) return; startWorkflowHandoff("voice"); toast.success("Script loaded into Voiceover Studio!"); navigate("/voice"); };
  const handleSendToRepurposer = () => { if (!activeRewrite) return; startWorkflowHandoff("repurposer"); toast.success("Script loaded into Repurposer!"); navigate("/repurposer"); };
  const handleCopyFullPackage = async () => {
    if (!activeRewrite) return;
    try { await navigator.clipboard.writeText(activePackageText); toast.success("Content package copied to clipboard"); } catch { toast.error("Copy failed"); }
  };
  const handleSaveActivePackage = () => {
    if (!activeRewrite || isActivePackageSaved) return;
    saveContent({
      type: "script",
      title: activePackageLibraryTitle,
      content: activePackageText,
      metadata: { platform: "YouTube", style: activeRewrite.tier === "premium" ? "Pro rewrite" : "Standard rewrite" },
    });
    toast.success("Content package saved to your library");
  };
  const handleDownloadPackage = async () => {
    if (!activeRewrite) return;
    try {
      const { downloadAsText } = await import("@/lib/export");
      downloadAsText(activePackageText, `tubeclick-package-${activeRewrite.rewrittenTitle.slice(0, 40).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "content"}.txt`);
      toast.success("Content package downloaded");
    } catch { toast.error("Download failed"); }
  };
  // THE SINGLE ENTRY POINT for the big blue Execute button. Clone & Crush
  // rewrites require a real Supabase session, so unlike lightweight preview
  // actions we authenticate before calling the API. A purpose-scoped snapshot
  // carries the guest's submitted URL + selected Slot 1 across the strict
  // guest→user privacy reset, then the original action continues.
  const handleCloneAndCrush = async () => {
    if (!selectedVideo) { toast.error("Select a competitor video from matrix"); return; }
    if (isExecutingRef.current) return;
    if (!isTierReady) { toast.loading("Checking your plan…", { id: "tier-hydrating" }); return; }
    if (isFreeCooldownActive) { routeToProUpsell("premium"); return; }
    if (enforcePremiumPaywall()) return;

    if (!isAuthenticated) {
      const inMemoryPending = createPendingAuthWorkflow(
        useCloneCrushStore.getState(),
        selectedVideo.videoId,
      );
      // sessionStorage survives a same-tab OAuth redirect but remains scoped to
      // this tab. It cannot leak a pending workflow into another signed-in tab.
      persistPendingAuthWorkflow(inMemoryPending);
      const authenticated = await requestAuthentication("complete your Free Chain-Loop");
      if (!authenticated) {
        consumePendingAuthWorkflow();
        return;
      }

      // SoftGate intentionally purges guest state on an identity transition.
      // Restore only this explicitly pending workflow into the newly
      // authenticated user's namespace; never migrate arbitrary prior-user
      // state. The in-memory fallback covers browsers that disable storage.
      const pending = consumePendingAuthWorkflow() ?? inMemoryPending;
      if (!restorePendingAuthWorkflow(pending)) {
        toast.info("Slot 1 advanced while sign-in was completing. Your next result is ready.");
        return;
      }
    }

    return performCloneAndCrush();
  };

  // A full-page OAuth fallback destroys the Promise continuation above. Once
  // AuthCallback returns to /clone-crush, consume the tab-scoped snapshot,
  // restore the selected Slot 1, and resume exactly once on the next render.
  useEffect(() => {
    if (!isAuthenticated || !isTierReady || pendingAuthResumeVideoIdRef.current) return;
    const pending = consumePendingAuthWorkflow();
    if (!pending) return;
    if (!restorePendingAuthWorkflow(pending)) {
      toast.info("Slot 1 advanced while sign-in was completing. Your next result is ready.");
      return;
    }
    pendingAuthResumeVideoIdRef.current = pending.selectedVideoId;
    setPendingAuthResumeNonce((nonce) => nonce + 1);
  }, [isAuthenticated, isTierReady]);

  useEffect(() => {
    const pendingVideoId = pendingAuthResumeVideoIdRef.current;
    if (
      !pendingAuthResumeNonce ||
      !pendingVideoId ||
      !isAuthenticated ||
      !isTierReady ||
      selectedVideo?.videoId !== pendingVideoId ||
      isExecutingRef.current
    ) {
      return;
    }
    pendingAuthResumeVideoIdRef.current = null;
    void performCloneAndCrush();
    // performCloneAndCrush is render-local and intentionally omitted. The
    // nonce + ref form a one-shot handoff after the restored store re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAuthResumeNonce, isAuthenticated, isTierReady, selectedVideo?.videoId]);

  const handleCopyThumbnailPrompt = async () => { if (!activeRewrite) return; try { await navigator.clipboard.writeText(activeRewrite.thumbnailPrompt || "Cinematic thumbnail"); toast.success("Thumbnail prompt copied!"); } catch { toast.error("Copy failed"); } };
  const handleCopySeoTags = async () => { if (!activeRewrite) return; try { await navigator.clipboard.writeText((activeRewrite.seoTags||[]).join(", ")); toast.success("SEO tags copied!"); } catch { toast.error("Copy failed"); } };
  const handleCopyScript = async () => { if (!activeRewrite) return; const txt = `TITLE: ${activeRewrite.rewrittenTitle}\nHOOK: ${activeRewrite.glitchHook}\nSCRIPT: ${activeRewrite.fullScript}`; try { await navigator.clipboard.writeText(txt); setCopiedText(true); toast.success("Script copied!"); setTimeout(()=>setCopiedText(false),2000); } catch { toast.error("Copy failed"); } };
  const openReferralRewards = () => openProUpgrade({ defaultTab: "referral", reason: "referral" });

  return (
    <div className="relative space-y-6 md:space-y-8 animate-fade-in pb-12">
      <EngineScriptLoop />
      {/* Dopamine overlays */}
      <XpGainPopup trigger={xpTrigger} xp={30} label="XP earned" />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] pointer-events-none z-30">
        <ParticleBurst trigger={burstTrigger} />
      </div>

      <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2 text-glitch">
            <Zap className="w-7 h-7 md:w-8 md:h-8 text-primary animate-pulse" />
            Analyze &amp; Create <span className="ml-1 text-sm font-mono font-semibold tracking-wide text-primary/80 md:text-base">Clone &amp; Crush AI</span>
          </h1>
          <p className="text-sm md:text-base text-muted-foreground mt-1 max-w-3xl">Analyze a public YouTube channel, find what is gaining momentum, and turn one opportunity into an original content package.</p>
        </div>
        <div className="flex items-center gap-3">
          <EntitlementStatus compact />
          {!isPro && <Button size="sm" onClick={openReferralRewards} className="text-[10px] px-3 h-8 font-display">See Pro options</Button>}
        </div>
      </div>

      <div className="relative z-10 grid lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 space-y-6">
          {/* Ghost Cache: multi-slot channel memory. Free = 1 slot; Pro = 5 slots.
              Free users see slots 2–5 as encrypted lock glyphs. */}
          <Card className="glass-strong border-primary/20">
            <CardHeader className="pb-3">
              <CardTitle className="font-display text-sm flex items-center gap-2">
                <Database className="w-4 h-4 text-primary" />
                Saved channels
                <span className="ml-1 text-[10px] font-mono font-normal tracking-wide text-muted-foreground">Ghost Cache</span>
                {isPro && (
                  <span className="ml-1 px-1.5 py-0.5 rounded bg-cyan-400/15 text-cyan-300 border border-cyan-400/30 text-[9px] font-mono font-black tracking-widest">
                    5 SLOTS
                  </span>
                )}
              </CardTitle>
              <CardDescription className="text-[11px]">
                Keep channels ready for repeat analysis. {isPro ? "Up to 5 saved channels" : "1 saved channel on Free • Pro unlocks 5"}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-5 gap-2">
                {Array.from({ length: isPro ? PRO_GHOST_CACHE_SLOTS : FREE_GHOST_CACHE_SLOTS }).map((_, i) => {
                  const slot = savedChannels.find((c) => c.slotIndex === i);
                  const isActive = activeSlotIndex === i;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        if (!slot) {
                          if (!isPro && i >= FREE_GHOST_CACHE_SLOTS) { routeToProUpsell("locked"); return; }
                          // Empty slot in range — focus input to save new channel.
                          return;
                        }
                        if (isFreeCooldownActive) { toast.error("24h cooldown active — finish this Chain-Loop before switching", { id: "cooldown-switch" }); return; }
                        switchActiveSlot(i);
                        if (slot.url !== displayedChannelInput) setChannelDraft(slot.url, "pro");
                        toast.success(`Switched to slot ${i+1}: ${slot.name || slot.handle}`, { id: "slot-switch" });
                      }}
                      className={
                        "group relative p-2 rounded-lg border text-left transition-all " +
                        (isActive
                          ? "border-primary bg-primary/15 ring-2 ring-primary/40 shadow-neon-glow"
                          : slot
                            ? "border-border/60 bg-secondary/30 hover:border-primary/50"
                            : "border-dashed border-border/50 bg-secondary/10 hover:border-primary/30 text-muted-foreground")
                      }
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {slot?.avatar ? (
                          <img src={slot.avatar} alt="" className="w-6 h-6 rounded-full object-cover shrink-0 border border-primary/30" />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0">
                            {isPro || i < FREE_GHOST_CACHE_SLOTS ? <PlusCircle className="w-3 h-3 text-primary" /> : <Lock className="w-3 h-3 text-primary" />}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-[8px] font-mono text-primary/80 uppercase tracking-widest">SLOT {i+1}</p>
                          <p className="text-[10px] font-bold text-foreground truncate">
                            {slot?.name || slot?.handle || (isPro || i < FREE_GHOST_CACHE_SLOTS ? "Empty" : "Locked")}
                          </p>
                        </div>
                      </div>
                      {slot?.niche && (
                        <p className="mt-1 text-[8px] font-mono text-muted-foreground truncate">⟐ {slot.niche}</p>
                      )}
                    </button>
                  );
                })}
                {!isPro && Array.from({ length: PRO_GHOST_CACHE_SLOTS - FREE_GHOST_CACHE_SLOTS }).map((_, i) => {
                  const slotIdx = i + FREE_GHOST_CACHE_SLOTS;
                  return (
                    <button
                      key={`pro-${slotIdx}`}
                      type="button"
                      onClick={() => routeToProUpsell("locked")}
                      className="p-2 rounded-lg border border-dashed border-primary/20 bg-primary/5 text-primary/60 hover:bg-primary/10 transition"
                    >
                      <div className="flex items-center gap-2">
                        <Lock className="w-4 h-4" />
                        <div>
                          <p className="text-[8px] font-mono uppercase tracking-widest">SLOT {slotIdx+1}</p>
                          <p className="text-[10px] font-bold">Pro</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="glass-strong bracket border-primary/20">
            <CardHeader className="pb-3">
              <CardTitle className="font-display text-base flex items-center gap-2"><Terminal className="w-5 h-5 text-primary" />1. Analyze a channel</CardTitle>
              <CardDescription className="text-xs">Paste a public YouTube channel URL or @handle. We use public channel data only; no upload access is required.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Youtube className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    aria-label="YouTube Channel URL or Handle"
                    placeholder="YouTube Channel URL or Handle (e.g. @MrBeast)"
                    value={displayedChannelInput}
                    onChange={(event) => {
                      const next = event.target.value;
                      const result = setChannelDraft(next, isPro ? "pro" : "free");
                      if (!result.ok) { routeToProUpsell("channel"); return; }
                      if (next.trim().length > 0 && (activeRewrite || logSteps.length > 0 || rewrites.length > 0)) {
                        setActiveRewrite(null);
                        setLogSteps([]);
                        setActiveVideoId(null);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (!isFreeChannelLocked) return;
                      if (event.key.length === 1 || event.key === "Backspace" || event.key === "Delete") {
                        event.preventDefault();
                        routeToProUpsell("channel");
                      }
                    }}
                    onPaste={(event) => {
                      if (!isFreeChannelLocked) return;
                      event.preventDefault();
                      routeToProUpsell("channel");
                    }}
                    className="pl-10 pr-24 bg-secondary/40 border-border/80 h-11 text-sm placeholder:text-muted-foreground/60"
                    readOnly={!isTierReady || isFreeChannelLocked}
                  />
                  {isFreeChannelLocked && (
                    <button
                      type="button"
                      onClick={() => routeToProUpsell("channel")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-primary hover:bg-primary/20"
                    >
                      <Lock className="h-3 w-3" /> Free URL locked
                    </button>
                  )}
                </div>
                <div className="relative sm:w-[190px] shrink-0 group">
                  <span className="pointer-events-none absolute left-9 top-1.5 z-10 font-mono text-[7px] font-bold uppercase tracking-[0.2em] text-cyan-400/80">
                    Output Language
                  </span>
                  <Languages className="pointer-events-none absolute bottom-3 left-3 z-10 h-4 w-4 text-cyan-400 transition-colors group-focus-within:text-primary" />
                  <Select
                    value={outputLanguage}
                    onValueChange={(value) => setOutputLanguage(normalizeCloneCrushOutputLanguage(value))}
                    disabled={isProfiling || isSearchingCompetitors || isRewriting}
                  >
                    <SelectTrigger
                      aria-label="Output Language"
                      className="h-11 border-cyan-400/30 bg-gradient-to-r from-cyan-500/10 via-secondary/50 to-fuchsia-500/10 pl-9 pt-3 font-display text-xs uppercase tracking-wider shadow-[inset_0_0_18px_rgba(34,211,238,0.06)] hover:border-cyan-400/50 focus:ring-cyan-400/40"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-cyan-400/30 bg-background/95 font-display backdrop-blur-xl">
                      <SelectItem value="English">English</SelectItem>
                      <SelectItem value="Hindi">Hindi</SelectItem>
                      <SelectItem value="Hinglish">Hinglish</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleProfileChannel} disabled={isProfiling || !isTierReady} className="cyber-button px-5 h-11 shrink-0 font-display text-sm flex gap-2">
                  {isProfiling ? <><Loader2 className="w-4 h-4 animate-spin" />Analyzing...</>
                    : !isTierReady ? <><Loader2 className="w-4 h-4 animate-spin" />Checking access...</>
                    : isFreeConveyorActive ? <><Lock className="w-4 h-4" />Current analysis active</>
                    : <><Cpu className="w-4 h-4" />Find opportunities</>}
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
                <Radio className="w-3 h-3 text-green-400" />
                <span>Public YouTube signals • fallback estimates are labeled</span>
                <span className="text-cyan-400/80">• Output: {outputLanguage}</span>
              </div>
            </CardContent>
          </Card>

          {threatAlerts.length>0 && (
            <div className="space-y-2 animate-fade-in">
              {threatAlerts.slice(0,3).map((alert, idx)=>(
                <div key={idx} className={`p-3 rounded-xl border flex items-start gap-3 ${alert.type==='critical'?'bg-red-500/10 border-red-500/30':'bg-yellow-500/10 border-yellow-500/20'}`}>
                  <span className="text-lg shrink-0">{alert.icon}</span>
                  <div className="flex-1 min-w-0"><p className={`text-xs font-bold ${alert.type==='critical'?'text-red-400':'text-yellow-400'}`}>{alert.message}</p><div className="flex items-center gap-3 mt-1"><span className="text-[9px] text-muted-foreground">Urgency: {alert.urgencyScore}/100</span><span className="text-[9px] text-muted-foreground">{alert.hoursAgo<1?'Just now':`${Math.round(alert.hoursAgo)}h ago`}</span></div></div>
                </div>
              ))}
              {wideningGap && wideningGap.dailyLoss>0 && (
                <div className="p-3 rounded-xl bg-gradient-to-r from-red-500/5 via-card to-red-500/5 border border-red-500/15 flex items-center gap-3">
                  <TrendingUp className="w-4 h-4 text-red-400 shrink-0" />
                  <div className="flex-1"><p className="text-[10px] font-bold text-red-400 font-display uppercase tracking-wider">Widening Gap: ~${wideningGap.dailyLoss.toLocaleString()}/day • Live calculated</p><p className="text-[9px] text-muted-foreground mt-0.5">{wideningGap.message}</p></div>
                  <div className="text-right shrink-0"><p className="text-sm font-display font-bold text-red-400">${wideningGap.monthlyLoss.toLocaleString()}</p><p className="text-[8px] text-muted-foreground">Monthly slip</p></div>
                </div>
              )}
            </div>
          )}

          {profile && (
            <div className="grid lg:grid-cols-12 gap-4 items-center p-4 rounded-2xl bg-secondary/20 border border-border/60 backdrop-blur-md">
              <div className="lg:col-span-5 h-full">
                <Card className="glass-strong border-primary/40 p-5 h-full flex flex-col justify-between shadow-neon-glow bracket">
                  <div><div className="flex items-center justify-between mb-3"><span className="text-[10px] font-mono uppercase bg-primary/20 text-primary px-2.5 py-0.5 rounded-full font-bold">Your channel • Analysis ready</span><span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" /></div>
                  <div className="flex items-center gap-3.5 mt-2"><img src={profile.avatar} alt={profile.name} className="w-14 h-14 rounded-full border-2 border-primary/50 object-cover bg-card shadow-md shrink-0" /><div className="min-w-0"><p className="text-base font-bold text-foreground truncate">{profile.name}</p><p className="text-xs text-primary font-medium mt-0.5">{profile.handle} {(profile as any).isGhostReconstructed && <span className="text-[9px] bg-amber-500/15 text-amber-300 border border-amber-500/20 px-1.5 py-0.5 rounded-full ml-1">ESTIMATED PROFILE</span>}</p></div></div>
                  <p className="text-xs text-muted-foreground mt-3 line-clamp-3 leading-relaxed">{profile.description}</p></div>
                  <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between text-[11px] text-muted-foreground"><span>Niche: <strong className="text-foreground">{nicheInput||"Auto"}</strong></span><span className="text-green-400 font-semibold flex items-center gap-1"><Activity className="w-3 h-3" />Active</span></div>
                </Card>
              </div>
              <div className="lg:col-span-2 flex flex-col items-center justify-center py-2 lg:py-0"><div className="relative flex items-center justify-center"><div className="absolute inset-0 bg-red-500/30 rounded-full blur-xl animate-pulse" /><div className="w-14 h-14 rounded-full bg-gradient-to-br from-red-600 to-rose-950 border-2 border-red-500 flex items-center justify-center shadow-[0_0_30px_rgba(239,68,68,0.9)] relative z-10 animate-pulse"><Zap className="w-7 h-7 text-white fill-white animate-bounce" /></div></div><span className="text-[11px] font-display font-extrabold text-red-500 tracking-widest mt-2 uppercase drop-shadow-[0_0_10px_rgba(239,68,68,0.8)]">COMPETITOR COMPARISON</span></div>
              <div className="lg:col-span-5 h-full">
                <Card className="glass-strong border-border/80 p-5 h-full flex flex-col justify-between">
                  <div><div className="flex items-center justify-between mb-3"><span className="text-[10px] font-mono uppercase bg-red-500/10 text-red-400 border border-red-500/20 px-2.5 py-0.5 rounded-full font-bold">Competitor opportunities</span><span className="text-xs text-muted-foreground">{competitors.length} videos {(competitors[0] as any)?.isGhostReconstructed && <span className="text-amber-300">• Estimated</span>}</span></div>
                  {isSearchingCompetitors ? (<div className="py-10 text-center space-y-2"><Loader2 className="w-7 h-7 animate-spin text-primary mx-auto" /><p className="text-xs text-muted-foreground">Auditing what's working…</p><div className="flex justify-center gap-1 mt-2">{[0,1,2,3].map(i=><span key={i} className="w-1 h-1 rounded-full bg-primary/60 animate-pulse" style={{animationDelay:`${i*150}ms`}} />)}</div></div>) : competitors.length>0 ? (
                    <div key={workflowNonce} className="grid grid-cols-1 gap-3 mt-2 sm:grid-cols-3">{competitors.map((video, idx)=>{ const isSelected = selectedVideo?.videoId===video.videoId; const velocityColor = (video.viralVelocityScore||0)>=70?'text-red-400':(video.viralVelocityScore||0)>=40?'text-yellow-400':'text-green-400';
                      // Conveyor semantics: slot0 (idx===0) is the
                      // actionable tile (or the pinned 24h-locked result
                      // during cooldown). Slots 1+2 are always future
                      // teaser tiles and show the countdown overlay.
                      const isTeaserSlot = idx > 0;
                      const isCooldownPinnedTile = isFreeCooldownActive && idx === 0 && freeLockedVideoId === video.videoId;
                      const showTileCooldown = isTeaserSlot && !isPro && freeCooldownUntil;
                      // Free users can never click teaser slots — they
                      // require pro to unlock early.
                      const tileLocked = (isTeaserSlot && !isPro) || (!isPro && dailyLimitActive && !isSelected);
                      const tileLabel = isCooldownPinnedTile ? "Locked • 24h" : isTeaserSlot ? "NEXT • LOCKED" : "SLOT 1 • ACTIVE";
                      const selectVideo = () => {
                        if (isTeaserSlot && !isPro) { routeToProUpsell("locked"); return; }
                        if (!isPro && dailyLimitActive) { openReferralRewards(); return; }
                        // During cooldown the pinned tile remains
                        // selectable but cannot trigger a new generation
                        // (the Execute button is disabled too).
                        // New tile = new active asset. Wipe previously-generated
                        // script/thumb/tags/guide so stale output from a prior
                        // competitor never bleeds onto the newly-selected tile.
                        setActiveRewrite(null);
                        setLogSteps([]);
                        setActiveTab("script");
                        setCopiedText(false);
                        setActiveVideoId(video.videoId); selectWorkflowCompetitor({videoId:video.videoId,title:video.title,url:video.url,channelName:video.channelName,thumbnail:video.thumbnail}, nicheInput);
                      };
                      return (
                      <div
                        key={video.videoId}
                        onClick={selectVideo}
                        role="group"
                        aria-label={`${isTeaserSlot && !isPro ? "Locked" : "Selectable"} competitor opportunity: ${video.title}`}
                        className={`group relative min-w-0 rounded-xl border p-3 transition-all duration-300 flex cursor-pointer flex-col justify-between bg-secondary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:p-2 ${isSelected||isCooldownPinnedTile?"border-primary bg-primary/15 ring-2 ring-primary/60 shadow-neon-glow":"border-border/60 hover:border-border"} ${tileLocked?"opacity-80":""}`}
                      >
                        <div className="absolute top-1 left-1 z-10 bg-primary text-primary-foreground text-[9px] font-bold px-2 py-1 rounded-full">{tileLabel}</div>
                        <div className="relative aspect-video rounded-lg overflow-hidden bg-black/60 shrink-0 mb-1.5">
                          <img src={video.thumbnail} alt={video.title} className={`w-full h-full object-cover ${isTeaserSlot && !isPro ? "opacity-30 blur-[3px]" : ""}`} />
                          {!isPro && idx === 0 && isFreeConveyorActive && (
                            <div className="absolute right-1 top-1 z-20 rounded border border-cyan-300/40 bg-black/80 px-1.5 py-1 font-mono text-[8px] font-black tracking-wider text-cyan-200">
                              SLOT 1 • {formatConveyorCountdown(cooldownRemainingMs)}
                            </div>
                          )}
                          {isTeaserSlot && !isPro ? (
                            // Teaser slots: countdown band ABOVE
                            // thumbnail + large-font view count.
                            // During cooldown the overlay ticks live;
                            // outside cooldown show a static "NEXT"
                            // teaser mask (FreeCooldownOverlay's tile
                            // variant owns the FOMO hierarchy).
                            showTileCooldown && freeCooldownUntil ? (
                              <FreeCooldownOverlay unlocksAt={freeCooldownUntil} views={video.views} onUpgrade={()=>routeToProUpsell("premium")} variant="tile" />
                            ) : (
                              <div className="absolute inset-0 z-20 flex flex-col overflow-hidden rounded-lg border border-primary/40 bg-gradient-to-b from-black/85 via-black/70 to-black/90 backdrop-blur-md">
                                <div className="flex items-center justify-center gap-1.5 border-b border-primary/30 bg-primary/15 px-2 py-1.5">
                                  <Lock className="h-3 w-3 text-primary" />
                                  <span className="font-mono text-[11px] font-black text-primary tracking-widest">NEXT • LOCKED</span>
                                </div>
                                <div className="flex flex-1 flex-col items-center justify-center gap-1 px-2 text-center">
                                  <p className="font-display text-xl md:text-2xl font-black text-foreground drop-shadow-[0_2px_8px_rgba(139,92,246,0.6)] leading-none">
                                    {video.views}
                                  </p>
                                  <p className="text-[9px] font-mono uppercase tracking-widest text-primary/80">views • upcoming</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); routeToProUpsell("locked"); }}
                                  className="m-1.5 cyber-button flex h-7 items-center justify-center gap-1 rounded-md text-[9px] font-display font-bold uppercase tracking-wider"
                                >
                                  <Sparkles className="h-2.5 w-2.5" /> View Pro access
                                </button>
                              </div>
                            )
                          ) : (
                            !isPro && dailyLimitActive && <DailyLimitOverlay />
                          )}
                        </div>
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs sm:text-[9px] font-bold line-clamp-2 text-foreground leading-tight">{video.title}</p>
                            <button type="button" onClick={(event) => { event.stopPropagation(); selectVideo(); }} className="min-h-8 shrink-0 rounded-md border border-primary/30 bg-primary/10 px-2 text-[9px] font-semibold text-primary hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:min-h-6 sm:px-1.5" aria-label={`${isTeaserSlot && !isPro ? "View" : "Select"} ${video.title}`}>
                              {isTeaserSlot && !isPro ? "View" : "Select"}
                            </button>
                          </div>
                          <p className="text-[11px] md:text-sm text-primary font-display font-black mt-1 leading-none">{video.views}</p><div className="flex items-center gap-1.5 mt-1">{video.estimatedRevenue && <span className="text-[9px] sm:text-[7px] font-bold text-green-400 bg-green-400/10 px-1 py-0.5 rounded flex items-center gap-0.5"><DollarSign className="w-2.5 h-2.5" />{video.estimatedRevenue}</span>}{video.viralVelocityScore!==undefined && !showTileCooldown && <span className={`text-[9px] sm:text-[7px] font-bold ${velocityColor} bg-secondary/60 px-1 py-0.5 rounded flex items-center gap-0.5`}><Flame className="w-2.5 h-2.5" />{video.viralVelocityScore}</span>}{!isTeaserSlot && (
                            // 🔍 INTERROGATE chip — free users route to /rewards; pro opens drawer
                            isPro ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  // Lazy-store access avoids top-level import cycles.
                                  import("@/stores/useInterrogateStore").then((m) => {
                                    m.useInterrogateStore.getState().openDrawer(video.videoId, { title: video.title, url: video.url });
                                  });
                                }}
                                className="text-[9px] font-bold text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 px-1 py-0.5 rounded flex items-center gap-0.5 transition-colors"
                                title="Ask about this competitor video"
                              >
                                <Search className="w-2.5 h-2.5" /> ASK
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); routeToProUpsell("interrogate"); }}
                                className="text-[9px] font-bold text-muted-foreground bg-secondary/60 border border-border px-1 py-0.5 rounded flex items-center gap-0.5"
                                title="Pro feature: chat with competitor video"
                              >
                                <Lock className="w-2.5 h-2.5" /> ASK
                              </button>
                            )
                          )}
                          {/* 🔪 SQUAD chip — free users route to /rewards; pro triggers squad run */}
                          {!isTeaserSlot && (
                            isPro ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  // Scroll the dossier panel into view and trigger run.
                                  const el = document.getElementById("ghost-squad-dossier");
                                  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                                  // Defer the run click so the panel mounts first.
                                  setTimeout(() => {
                                    const btn = el?.querySelector<HTMLButtonElement>("button[data-squad-run='1']");
                                    btn?.click();
                                  }, 250);
                                }}
                                className="text-[9px] font-bold text-fuchsia-300 bg-fuchsia-500/10 hover:bg-fuchsia-500/20 border border-fuchsia-500/30 px-1 py-0.5 rounded flex items-center gap-0.5 transition-colors"
                                title="Open the competitor breakdown"
                              >
                                <Shield className="w-2.5 h-2.5" /> BREAKDOWN
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); routeToProUpsell("squad"); }}
                                className="text-[9px] font-bold text-muted-foreground bg-secondary/60 border border-border px-1 py-0.5 rounded flex items-center gap-0.5"
                                title="Pro feature: 4-agent Intel Squad dossier"
                              >
                                <Lock className="w-2.5 h-2.5" /> BREAKDOWN
                              </button>
                            )
                          )}</div></div>
                      </div>);})}</div>) : (<div className="py-8 text-center text-xs text-muted-foreground">Analyze a channel to see three high-momentum opportunities here.</div>)}</div>
                  {!isPro && (<div className="mt-3 p-2.5 rounded-lg bg-gradient-to-r from-primary/10 via-secondary/40 to-accent/10 border border-primary/20 flex items-center justify-between gap-2"><div className="flex items-center gap-2 min-w-0"><Lock className="w-4 h-4 text-primary shrink-0" /><p className="text-[10px] font-bold text-foreground truncate">Free includes 1 content package every 24h • Pro removes the wait</p></div><Button onClick={openReferralRewards} size="sm" className="cyber-button text-[10px] shrink-0 font-display h-7 px-2.5">See Pro options</Button></div>)}
                  <p className="mt-3 border-t border-border/40 pt-2 text-[10px] leading-relaxed text-muted-foreground"><span className="font-semibold text-foreground">How to read this:</span> views and recency come from public YouTube signals when available. Velocity and revenue are estimates; fallback results are marked as estimated.</p>
                </Card>
              </div>
            </div>
          )}

          {selectedVideo && (
            <div className="animate-fade-in">
              <NeuralVelocityEngine title={selectedVideo.title} niche={nicheInput} />
            </div>
          )}

          {envyMetrics && competitors.length>0 && (
            <div className="grid grid-cols-3 gap-3 animate-fade-in">
              <div className="p-3 rounded-xl glass-strong border-green-500/20"><p className="text-[10px] text-green-400 font-mono uppercase tracking-wider font-bold flex items-center gap-1"><DollarSign className="w-3 h-3" /> Estimated competitor revenue</p><p className="text-lg font-display font-bold text-green-400 mt-1">{envyMetrics.totalCompetitorMonthlyRevenue}</p><p className="text-[9px] text-muted-foreground mt-0.5">Combined estimate/mo • public signals</p></div>
              <div className="p-3 rounded-xl glass-strong border-red-500/20"><p className="text-[10px] text-red-400 font-mono uppercase tracking-wider font-bold flex items-center gap-1"><Flame className="w-3 h-3" /> Momentum estimate</p><p className="text-lg font-display font-bold text-red-400 mt-1">{envyMetrics.averageViralVelocity}/100</p><p className="text-[9px] text-muted-foreground mt-0.5">Calculated from views and recency</p></div>
              <div className="p-3 rounded-xl glass-strong border-primary/20"><p className="text-[10px] text-primary font-mono uppercase tracking-wider font-bold flex items-center gap-1"><Gauge className="w-3 h-3" /> Niche CPM</p><p className="text-lg font-display font-bold text-primary mt-1">{envyMetrics.nicheCpm}</p><p className="text-[9px] text-muted-foreground mt-0.5">{envyMetrics.niche}</p></div>
            </div>
          )}

          {profile && (
            <section aria-labelledby="advanced-intelligence-heading" className="space-y-4">
              <div>
                <h2 id="advanced-intelligence-heading" className="flex items-center gap-2 font-display text-lg font-semibold text-foreground md:text-xl">
                  <Compass className="h-5 w-5 text-cyan-300" /> Advanced intelligence
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Optional deeper analysis for the competitor you selected. Use these tools when you want more evidence before creating your package.</p>
              </div>

              {/* Dawn Patrol sunrise brief (MP6) — always visible to authed users so unread count pings */}
              {profile && (
            <div id="ghost-dawn-patrol" className="animate-fade-in">
              <DawnPatrolCard />
            </div>
          )}

          {/* Ghost Intel Squad dossier panel (MP4) */}
          {profile && competitors.length > 0 && (
            <div id="ghost-squad-dossier" className="animate-fade-in">
              <GhostSquadDossier
                video={selectedVideo ? {
                  videoId: selectedVideo.videoId,
                  title: selectedVideo.title,
                  url: selectedVideo.url,
                  channelName: selectedVideo.channelName,
                  views: selectedVideo.views,
                  viewsCount: selectedVideo.viewsCount || clientViewCount(selectedVideo),
                  viralVelocityScore: selectedVideo.viralVelocityScore,
                  estimatedRevenue: selectedVideo.estimatedRevenue,
                  publishedAt: selectedVideo.publishedAt,
                  thumbnail: selectedVideo.thumbnail,
                } : null}
                savedNiche={nicheInput || savedNiche || "General YouTube Content"}
                slotId={activeSlotIndex}
                onUpgrade={() => routeToProUpsell("squad")}
              />
            </div>
          )}

          {/* Ghost Visual Recon panel (MP5 · BLACK-OPS) */}
          {profile && competitors.length > 0 && (
            <div id="ghost-visual-recon" className="animate-fade-in">
              <GhostVisualRecon
                video={selectedVideo ? {
                  videoId: selectedVideo.videoId,
                  title: selectedVideo.title,
                  url: selectedVideo.url,
                  thumbnail: selectedVideo.thumbnail,
                } : null}
                savedNiche={nicheInput || savedNiche || "General YouTube Content"}
                slotId={activeSlotIndex}
                onUpgrade={() => {
                  toast.error("Visual Recon is Black-Ops • Rerouting to clearance", { id: "recon-paywall" });
                  navigate("/rewards?upsell=recon&tier=pro");
                }}
              />
            </div>
          )}
            </section>
          )}

          {selectedVideo && (
            <Card key={workflowNonce} className="glass-strong border-border bracket">
              <CardHeader className="pb-3"><CardTitle className="font-display text-base flex items-center gap-2"><Zap className="w-5 h-5 text-primary" />3. Create your content package</CardTitle><CardDescription className="text-xs">Build an original package with a title, hook, script, thumbnail direction, SEO tags, and an editing guide.</CardDescription></CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div onClick={()=>setSelectedVideoTier("free")} className={`rounded-xl border p-4 cursor-pointer transition-all ${selectedTier==="free"?"border-primary bg-primary/5 ring-1 ring-primary/30":"border-border/60 hover:border-border bg-secondary/10"}`}>
                    <div className="flex items-center gap-2 mb-1"><input type="radio" checked={selectedTier==="free"} onChange={()=>{}} className="accent-primary" /><p className="text-sm font-bold text-foreground">Standard rewrite <span className="ml-1 text-[10px] font-mono font-normal text-yellow-300">60%</span></p></div>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">Pulls out the core idea and rebuilds it with a fresh narrative, pacing, and examples. Included with Free.</p>
                  </div>
                  <div onClick={()=>{
                    // Free users clicking the 99% Glitch tier card → instant upsell
                    // (use canUsePremium which reads the live store + isProTier).
                    if (!canUsePremium()) { routeToProUpsell("premium"); return; }
                    setSelectedVideoTier("premium");
                  }} className={`rounded-xl border p-4 cursor-pointer transition-all ${!isPro?"opacity-60":""} ${selectedTier==="premium"?"border-primary bg-primary/5 ring-1 ring-primary/30":"border-border/60 hover:border-border bg-secondary/10"}`}>
                    <div className="flex items-center justify-between gap-2 mb-1"><div className="flex items-center gap-2"><input type="radio" checked={selectedTier==="premium"} onChange={()=>{}} disabled={!isPro} className="accent-primary" /><p className="text-sm font-bold text-foreground">Pro rewrite <span className="ml-1 text-[10px] font-mono font-normal text-red-300">99% Glitch</span></p></div>{!isPro && <Lock className="w-3.5 h-3.5 text-primary" />}</div>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">Adds deeper curiosity, pacing, and thumbnail pattern analysis for a more aggressive Pro package.</p>
                  </div>
                </div>
                <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl flex gap-3 items-start"><ShieldAlert className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" /><div><p className="text-xs font-bold text-yellow-500">Originality guard active</p><p className="text-[10px] text-muted-foreground leading-relaxed">Every output is rewritten to be genuinely yours — examples swapped, wording rebuilt. Never a raw copy.</p></div></div>
                <div className="relative w-full">
                  {(() => {
                    const freeBlocked = !isPro && (dailyLimitActive || selectedTier === "premium" || isFreeCooldownActive);
                    const buttonDisabled = isRewriting || freeBlocked || !isTierReady;
                    return (
                      <>
                        <Button onClick={handleCloneAndCrush} disabled={buttonDisabled} className="w-full h-12 bg-gradient-to-r from-primary to-accent text-primary-foreground font-display font-bold uppercase tracking-wider text-sm flex gap-2">
                          {isRewriting ? <><Loader2 className="w-4 h-4 animate-spin" />Generating your assets…</>
                            : !isTierReady ? <><Loader2 className="w-4 h-4 animate-spin" />Verifying clearance...</>
                            : isFreeCooldownActive ? <><Lock className="w-4 h-4" />24h wait — Unlock Pro</>
                            : !isPro && dailyLimitActive ? <><Lock className="w-4 h-4" />Daily limit — See Pro options</>
                            : !isPro && selectedTier==="premium" ? <><Lock className="w-4 h-4" />Pro rewrite — See options</>
                            : <><Zap className="w-4 h-4 fill-primary-foreground" />Create content package</>}
                        </Button>
                        {!isPro && dailyLimitActive && <div className="absolute inset-0 pointer-events-none" aria-hidden="true" />}
                        {!isPro && dailyLimitActive && <div className="mt-3"><DailyLimitOverlay variant="hero" /></div>}
                        {isFreeCooldownActive && freeCooldownUntil && (
                          <div className="mt-3">
                            <FreeCooldownOverlay unlocksAt={freeCooldownUntil} views={selectedVideo?.views} onUpgrade={()=>routeToProUpsell("premium")} variant="hero" />
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>

                {logSteps.length>0 && (
                  <div className="font-mono bg-black rounded-xl border border-primary/20 p-4 text-xs space-y-2 max-h-[260px] overflow-y-auto relative overflow-hidden">
                    <div className="absolute inset-0 ghost-scanline opacity-[0.04] pointer-events-none" />
                    <p className="text-primary font-bold border-b border-border/50 pb-1.5 flex items-center justify-between relative z-10"><span className="flex items-center gap-2"><Terminal className="w-3.5 h-3.5" />GENERATION LOG</span><span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /><span className="text-[9px] bg-primary/20 px-2 py-0.5 rounded text-primary animate-pulse">LIVE</span></span></p>
                    <div className="relative z-10 space-y-1.5">
                    {logSteps.map((step, idx)=>(
                      <div key={idx} className="flex items-center justify-between text-muted-foreground leading-relaxed">
                        <span className="flex items-center gap-2 min-w-0 flex-1"><ChevronRight className="w-3 h-3 text-primary shrink-0" /><span className={`truncate ${step.status==="success"?"text-green-400 font-semibold":step.status==="rerouting"?"text-amber-300":step.status==="processing"?"text-cyan-300":""}`}>{step.label}</span>{step.meta && <span className="text-[8px] bg-secondary/60 px-1.5 py-0.5 rounded border border-border/40 shrink-0">{step.meta}</span>}</span>
                        <span className="shrink-0 ml-2">
                          {step.status==="pending" && <span className="text-muted-foreground/30 text-[9px]">PENDING</span>}
                          {step.status==="processing" && <span className="text-cyan-400 animate-pulse text-[9px] flex items-center gap-1"><span className="w-1 h-1 rounded-full bg-cyan-400 animate-ping" />EXEC</span>}
                          {step.status==="success" && <span className="text-green-400 text-[9px] font-bold">SECURED ✓</span>}
                          {step.status==="rerouting" && <span className="text-amber-300 text-[9px] font-bold flex items-center gap-1"><RefreshCw className="w-3 h-3 animate-spin" />RE-ROUTING VIA GHOST</span>}
                          {step.status==="error" && <span className="text-amber-300 font-bold text-[9px]">RE-ROUTING</span>}
                        </span>
                      </div>
                    ))}
                    </div>
                    {/* Fake node dots */}
                    <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border/20 relative z-10">
                      {["api","cache","fallback"].map((n,i)=>(
                        <span key={n} className={`text-[8px] font-mono px-1.5 py-0.5 rounded border ${logSteps.some(s=>s.status==="processing") && i===0 ?"bg-primary/20 border-primary/30 text-primary animate-pulse":"bg-secondary/40 border-border/30 text-muted-foreground"}`}>{n}</span>
                      ))}
                      <span className="text-[8px] text-muted-foreground ml-auto">redundant sources • secure</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="lg:col-span-4 space-y-6">
          {activeRewrite ? (
            <Card className={`glass-strong ${isFreeCooldownActive ? "border-amber-500/40" : "border-primary/40"} shadow-neon-glow animate-fade-in bracket relative overflow-hidden`}>{isFreeCooldownActive && freeCooldownUntil && <FreeCooldownOverlay unlocksAt={freeCooldownUntil} views={selectedVideo?.views} onUpgrade={()=>routeToProUpsell("premium")} variant="result" />}
              <CardHeader className="pb-3 border-b border-border/40"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-[9px] font-mono tracking-widest uppercase">Content package • {activeRewrite.outputLanguage || "English"}</span><CardTitle className="font-display text-base text-foreground mt-2 line-clamp-2">{activeRewrite.rewrittenTitle}</CardTitle><p className="text-[10px] text-muted-foreground truncate mt-1">Based on: {activeRewrite.targetVideoTitle}</p></div><Button variant="outline" size="icon" onClick={handleCopyScript} aria-label="Copy generated script" title="Copy generated script" className="shrink-0 border-border hover:border-primary/40 text-muted-foreground hover:text-primary active:scale-95"><Copy className="w-4 h-4" /></Button></div></CardHeader>
              <CardContent className="pt-5 space-y-5">
                <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/[0.04] p-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15"><Sparkles className="h-4 w-4 text-primary" aria-hidden="true" /></div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-primary">Recommended next step</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">Turn this script into narration</p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">Send the package to Voiceover Studio, or choose another production action below.</p>
                    </div>
                  </div>
                  <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 -mx-1 rounded-xl bg-background/85 p-1 backdrop-blur-md sm:static sm:mx-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
                    <Button onClick={handleSendToVoiceover} className="cyber-button h-10 w-full gap-2 text-xs font-display">
                      <Mic className="h-3.5 w-3.5" /> Send to Voiceover
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 gap-2 border-t border-border/40 pt-3 sm:grid-cols-2">
                    <Button onClick={handleSaveActivePackage} disabled={isActivePackageSaved} size="sm" variant="outline" className="h-9 justify-start gap-1.5 border-border text-xs">
                      {isActivePackageSaved ? <Check className="h-3.5 w-3.5 text-green-400" /> : <FileText className="h-3.5 w-3.5 text-primary" />}
                      {isActivePackageSaved ? "Saved to Library" : "Save to Library"}
                    </Button>
                    <Button onClick={handleDownloadPackage} size="sm" variant="outline" className="h-9 justify-start gap-1.5 border-border text-xs">
                      <Download className="h-3.5 w-3.5 text-primary" /> Download package
                    </Button>
                    <Button onClick={handleCopyFullPackage} size="sm" variant="outline" className="h-9 justify-start gap-1.5 border-border text-xs">
                      <Copy className="h-3.5 w-3.5 text-primary" /> Copy package
                    </Button>
                    <Button onClick={handleSendToRepurposer} size="sm" variant="outline" className="h-9 justify-start gap-1.5 border-border text-xs">
                      <Share2 className="h-3.5 w-3.5 text-primary" /> Repurpose content
                    </Button>
                    <Button onClick={handleCopyThumbnailPrompt} size="sm" variant="outline" className="h-9 justify-start gap-1.5 border-border text-xs">
                      <Image className="h-3.5 w-3.5 text-primary" /> Copy thumbnail prompt
                    </Button>
                    <Button onClick={handleCopySeoTags} size="sm" variant="outline" className="h-9 justify-start gap-1.5 border-border text-xs">
                      <Search className="h-3.5 w-3.5 text-primary" /> Copy SEO tags
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-3"><div className="flex-1"><div className="flex items-center justify-between mb-1"><span className="text-[10px] font-display font-bold text-foreground uppercase tracking-wider">Glitch Intensity</span><span className={`text-xs font-mono font-bold ${(activeRewrite.glitchIntensity||60)>=90?'text-red-400':'text-yellow-400'}`}>{activeRewrite.glitchIntensity||60}%</span></div><div className="h-2 bg-secondary rounded-full overflow-hidden"><div className={`h-full rounded-full transition-all duration-1000 ${(activeRewrite.glitchIntensity||60)>=90?'bg-gradient-to-r from-red-600 via-red-400 to-orange-400':'bg-gradient-to-r from-yellow-600 via-yellow-400 to-green-400'}`} style={{width:`${activeRewrite.glitchIntensity||60}%`}} /></div></div>{activeRewrite.glitchTechniques && <div className="flex flex-wrap gap-1">{activeRewrite.glitchTechniques.map((tech:any,i:number)=><span key={i} className="text-[8px] font-mono bg-red-500/10 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded">{tech}</span>)}</div>}</div>
                <div className="relative rounded-xl border border-destructive/30 bg-destructive/5 p-4 overflow-hidden shadow-sm"><div className="absolute top-0 right-0 w-20 h-20 bg-destructive/10 rounded-full blur-xl" /><div className="flex items-start gap-3 relative z-10"><ShieldAlert className="w-5 h-5 text-destructive shrink-0 mt-0.5" /><div><p className="text-xs font-bold text-destructive font-display uppercase tracking-wider">Opening hook • {(activeRewrite.glitchIntensity||60)>=90?'Pro':'Standard'} rewrite</p><p className="text-xs text-foreground mt-1.5 leading-relaxed font-medium italic">"{activeRewrite.glitchHook}"</p></div></div></div>
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full"><TabsList className="grid grid-cols-2 gap-1 bg-secondary/60 border border-border rounded-lg sm:grid-cols-4"><TabsTrigger value="script" className="text-[11px] font-semibold rounded-md">Script</TabsTrigger><TabsTrigger value="thumbnail" className="text-[11px] font-semibold rounded-md">Thumbnail</TabsTrigger><TabsTrigger value="tags" className="text-[11px] font-semibold rounded-md">SEO tags</TabsTrigger><TabsTrigger value="guide" className="text-[11px] font-semibold rounded-md">Editing guide</TabsTrigger></TabsList>
                  <TabsContent value="script" className="pt-3"><div className="rounded-xl border border-border/80 bg-secondary/30 p-4 h-[300px] overflow-y-auto font-sans text-xs md:text-sm text-foreground leading-relaxed whitespace-pre-wrap select-text">{activeRewrite.fullScript}</div></TabsContent>
                  <TabsContent value="thumbnail" className="pt-3 space-y-3">
                    {activeRewrite.reverseEngineeredPrompts && activeRewrite.reverseEngineeredPrompts.length>0 ? <>
                      {activeRewrite.reverseEngineeredSource && <div className="p-2.5 bg-green-500/10 rounded-xl border border-green-500/20 flex items-center gap-3"><img src={activeRewrite.reverseEngineeredSource.thumbnailUrl} alt="source" className="w-16 h-9 rounded object-cover bg-black/40 shrink-0" /><div className="flex-1 min-w-0"><p className="text-[10px] font-bold text-green-400">🔬 Reverse-Engineered</p><p className="text-[9px] text-muted-foreground truncate">{activeRewrite.reverseEngineeredSource.title}</p></div></div>}
                      {activeRewrite.reverseEngineeredPrompts.map((prompt:string,i:number)=><div key={i} className="p-3 bg-secondary/40 rounded-xl border border-border/60"><div className="flex items-center justify-between mb-1.5"><p className="text-xs font-bold text-foreground">{['Curiosity Gap','Shock/Fear','Authority/Proof','Number/List'][i]||'Visual'}</p><Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={async()=>{ try{ await navigator.clipboard.writeText(prompt); toast.success(`Prompt ${i+1} copied!`);} catch{ toast.error("Copy fail"); }}}><Copy className="w-3 h-3" /></Button></div><p className="text-[10px] font-mono text-primary bg-secondary/80 p-2.5 rounded-lg border border-primary/20 select-all leading-relaxed">{prompt}</p></div>)}
                    </> : <><div className="p-3 bg-secondary/40 rounded-xl border border-border/60"><p className="text-xs font-bold text-foreground mb-1">AI Thumbnail Prompt:</p><p className="text-xs font-mono text-primary bg-secondary/80 p-3 rounded-lg border border-primary/20 select-all leading-relaxed">{activeRewrite.thumbnailPrompt}</p></div><Button onClick={handleCopyThumbnailPrompt} size="sm" className="w-full cyber-button text-xs h-9"><Copy className="w-3.5 h-3.5 mr-2" />Copy Prompt</Button></>}
                  </TabsContent>
                  <TabsContent value="tags" className="pt-3 space-y-3"><div className="p-3 bg-secondary/40 rounded-xl border border-border/60"><p className="text-xs font-bold text-foreground mb-2">High-CTR SEO Tags:</p><div className="flex flex-wrap gap-1.5">{(activeRewrite.seoTags||[]).map((tag:string,i:number)=><span key={i} className="text-[10px] font-mono bg-primary/10 text-primary border border-primary/20 px-2 py-1 rounded-md">#{tag}</span>)}</div></div><Button onClick={handleCopySeoTags} size="sm" className="w-full cyber-button text-xs h-9"><Copy className="w-3.5 h-3.5 mr-2" />Copy Tags</Button></TabsContent>
                  <TabsContent value="guide" className="pt-3"><div className="rounded-xl border border-border/80 bg-secondary/30 p-4 h-[300px] overflow-y-auto font-sans text-xs text-foreground leading-relaxed whitespace-pre-wrap select-text">{activeRewrite.editingGuide}</div></TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          ) : (
            <Card className="glass-strong border-border p-6 text-center h-[420px] flex flex-col justify-center items-center bracket">
              <div className="w-16 h-16 rounded-2xl bg-secondary/60 flex items-center justify-center mb-4 border border-border"><FileText className="w-8 h-8 text-muted-foreground" /></div>
              <p className="text-base text-foreground font-bold">No Active Chain-Loop Package</p>
              <p className="text-xs text-muted-foreground max-w-[250px] mt-2 leading-relaxed">Analyze a channel, choose an opportunity, and create your first content package.</p>
              <div className="mt-4 flex items-center gap-2 text-[9px] font-mono text-muted-foreground"><Cpu className="w-3 h-3" />Automatic fallbacks • runs even when the API is busy</div>
            </Card>
          )}

          <Card className="glass-strong border-border"><CardHeader className="pb-2"><CardTitle className="font-display text-sm font-semibold text-foreground flex items-center gap-2"><History className="w-4 h-4 text-primary" />Saved packages ({rewrites.length})</CardTitle></CardHeader><CardContent className="px-3 pb-3">{rewrites.length>0 ? (<div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">{rewrites.map((r:any)=>{ const isSelected = activeRewrite?.id===r.id; return (<div key={r.id} className={`group relative flex items-center justify-between p-2.5 rounded-lg border text-left cursor-pointer transition-colors ${isSelected?"border-primary bg-primary/10":"border-border/40 hover:border-border bg-secondary/10"}`}><div onClick={()=>setActiveRewrite(r)} className="flex-1 min-w-0 pr-6"><p className="text-[11px] font-bold text-foreground truncate">{r.rewrittenTitle}</p><p className="text-[9px] text-muted-foreground truncate mt-0.5">{r.tier==="premium"?"Pro rewrite":"Standard rewrite"} • {r.outputLanguage || "English"} • {r.glitchIntensity||60}% • {new Date(r.createdAt).toLocaleDateString()}</p></div><button onClick={e=>{ e.stopPropagation(); deleteRewrite(r.id); toast.success("Package removed"); }} aria-label={`Delete saved package ${r.rewrittenTitle}`} title="Delete saved package" className="absolute right-2 opacity-0 group-hover:opacity-100 hover:text-destructive text-muted-foreground transition-all duration-200"><XCircle className="w-3.5 h-3.5" /></button></div>);})}</div>) : (<div className="text-center py-6 text-muted-foreground/60 text-xs">Generated Chain-Loop packages appear here • Ghost cached</div>)}</CardContent></Card>
        </div>
      </div>
      <GhostInterrogationDrawer />
    </div>
  );
}
