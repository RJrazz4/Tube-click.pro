import { useState, useCallback, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { 
  Zap, 
  Sparkles, 
  Copy, 
  Check, 
  FileText, 
  Youtube, 
  Loader2, 
  Lock, 
  Award, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  ArrowRight,
  ShieldAlert,
  Compass,
  History,
  TrendingUp,
  ExternalLink,
  ChevronRight,
  PlusCircle,
  XCircle,
  Mic,
  Image,
  Search,
  Film,
  DollarSign,
  Flame,
  Gauge,
  Share2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useCloneCrushStore, CompetitorVideo, ProfiledChannel, ScriptRewriteResult } from "@/stores/useCloneCrushStore";
import { useContentStore } from "@/stores/useContentStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { useTranscriptExtraction, useCloneCrushMutation } from "@/hooks/useSecureQuery";
import { useSoftGate } from "@/contexts/SoftGateContext";
import { useWorkflowStore } from "@/stores/useWorkflowStore";

type ProfileWithKeywords = ProfiledChannel & { extractedKeywords?: string[] };

function withClientTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId = 0;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(
      () => reject(new Error(`Request timed out after ${Math.round(timeoutMs / 1000)} seconds`)),
      timeoutMs,
    );
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId));
}

export default function CloneCrush() {
  const navigate = useNavigate();
  const { runGuarded } = useSoftGate();

  // Zustand State Stores
  const { 
    profile, 
    isProfiling, 
    competitors, 
    isSearchingCompetitors, 
    competitorsFetchedAt,
    envyMetrics,
    threatAlerts,
    wideningGap,
    rewrites,
    isRewriting,
    activeRewrite,
    setProfile,
    setIsProfiling,
    setCompetitors,
    setIsSearchingCompetitors,
    setThreatAlerts,
    addRewrite,
    setIsRewriting,
    setActiveRewrite,
    deleteRewrite,
    clearAll: clearCloneCrushStore
  } = useCloneCrushStore();

  const saveContent = useContentStore((s) => s.saveContent);
  const incrementStat = useContentStore((s) => s.incrementStat);
  
  const license = useAuthStore((s) => s.license);
  const startWorkflowProfile = useWorkflowStore((s) => s.startProfile);
  const selectWorkflowCompetitor = useWorkflowStore((s) => s.selectCompetitor);
  const saveWorkflowPackage = useWorkflowStore((s) => s.saveContentPackage);
  const startWorkflowHandoff = useWorkflowStore((s) => s.startHandoff);

  // Local Component States
  const [channelInput, setChannelInput] = useState("");
  const [nicheInput, setNicheInput] = useState("");
  const [customDescription, setCustomDescription] = useState("");
  const [selectedVideo, setSelectedVideo] = useState<CompetitorVideo | null>(null);
  const [selectedTier, setSelectedVideoTier] = useState<"free" | "premium">(license.tier === "free" ? "free" : "premium");
  const [copiedText, setCopiedText] = useState(false);
  const [activeTab, setActiveTab] = useState("script");

  // Step Logger for Interactive Console feel
  const [logSteps, setLogSteps] = useState<{ label: string; status: "pending" | "processing" | "success" | "error" }[]>([]);

  // Mutations
  const transcriptMutation = useTranscriptExtraction();
  const cloneCrushMutation = useCloneCrushMutation();

  // Never leave the paid protocol selected after an entitlement expires or changes.
  useEffect(() => {
    if (license.tier === "free") setSelectedVideoTier("free");
  }, [license.tier]);

  // Populate inputs from profile description/niche if available
  useEffect(() => {
    if (profile) {
      if (!channelInput) setChannelInput(profile.url || profile.handle);
      if (!nicheInput) {
        const desc = profile.description.toLowerCase();
        if (desc.includes("crypto") || desc.includes("bitcoin")) setNicheInput("Crypto & Finance");
        else if (desc.includes("tech") || desc.includes("coding") || desc.includes("software")) setNicheInput("Tech & Coding");
        else if (desc.includes("vlog") || desc.includes("travel")) setNicheInput("Lifestyle Vlogging");
        else if (desc.includes("cooking") || desc.includes("food")) setNicheInput("Culinary & Cooking");
        else if (desc.includes("business") || desc.includes("marketing")) setNicheInput("Business & Wealth");
        else setNicheInput("Educational Tutorials");
      }
      if (!customDescription) {
        setCustomDescription(profile.description.slice(0, 150) + "...");
      }
    }
  }, [profile]);

  // Background auto-discovery of competitors after profiling (Zero-Friction AI Niche Deduction)
  const autoDiscoverCompetitors = async (prof: ProfileWithKeywords) => {
    const extractedKeywords = Array.isArray(prof.extractedKeywords)
      ? prof.extractedKeywords.filter((keyword: unknown) => typeof keyword === "string" && keyword.trim()).slice(0, 8)
      : [];
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
    setCustomDescription((prof.description || discoveryDescription).slice(0, 150));
    setIsSearchingCompetitors(true);
    toast.loading(`AI automatically deducing niche ("${deducedNiche}") & auditing live viral velocity...`, { id: "competitors-find" });

    try {
      const res = await cloneCrushMutation.mutateAsync({
        action: "competitors",
        niche: deducedNiche,
        description: discoveryDescription
      });

      if (res.success && res.competitors) {
        const envyData = (res as any).envyMetrics || null;
        setCompetitors(res.competitors, envyData);
        const unlocked = res.competitors.find((v: any) => !v.isLocked) || res.competitors[0];
        setSelectedVideo(unlocked);
        selectWorkflowCompetitor({
          videoId: unlocked.videoId,
          title: unlocked.title,
          url: unlocked.url,
          channelName: unlocked.channelName,
          thumbnail: unlocked.thumbnail,
        }, deducedNiche);
        toast.success(`Showdown Matrix Ready! Discovered 3 high-velocity competitors.`, { id: "competitors-find" });

        // Fetch threat alerts in background (non-blocking)
        cloneCrushMutation.mutateAsync({
          action: "threat-alerts",
          competitors: res.competitors,
          userSubscribers: prof.subscriberCount || 0,
        }).then((alertRes: any) => {
          if (alertRes.success) {
            setThreatAlerts(alertRes.alerts || [], alertRes.wideningGap || null);
          }
        }).catch(() => {/* silent — threat alerts are non-critical */});
      } else {
        throw new Error(res.error || "No viral competitors found");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to discover competitors automatically.", { id: "competitors-find" });
    } finally {
      setIsSearchingCompetitors(false);
    }
  };

  // 1. Channel Profile Scraper Call
  const performProfileChannel = async () => {
    const input = channelInput.trim();
    if (!input) {
      toast.error("Please enter a YouTube Channel URL or Handle");
      return;
    }

    setIsProfiling(true);
    toast.loading("Scraping channel profile from YouTube...", { id: "profile-scrape" });

    try {
      const profileRequest = cloneCrushMutation.mutateAsync({
        action: "profile",
        channelUrl: input
      });
      const res = await withClientTimeout(profileRequest, 15_000);

      if (res.success && res.profile) {
        const profileResponse = res as typeof res & { extractedKeywords?: string[] };
        const profiledChannel: ProfileWithKeywords = {
          ...res.profile,
          extractedKeywords: profileResponse.extractedKeywords || res.profile.extractedKeywords || [],
        };
        setProfile(profiledChannel);
        startWorkflowProfile({
          id: profiledChannel.id,
          name: profiledChannel.name,
          handle: profiledChannel.handle,
          avatar: profiledChannel.avatar,
        });
        toast.success(`Success! Connected to ${profiledChannel.name}'s Channel Profile`, { id: "profile-scrape" });
        await autoDiscoverCompetitors(profiledChannel);
      } else {
        throw new Error(res.error || "Channel not found");
      }
    } catch (err: any) {
      toast.error(err.message || "Could not load live YouTube channel data.", { id: "profile-scrape" });
    } finally {
      setIsProfiling(false);
    }
  };

  const handleProfileChannel = () => {
    if (!channelInput.trim()) return performProfileChannel();
    return runGuarded("profile another channel", performProfileChannel);
  };

  // 3. Double-Loop Loophole Rewriter Execution (Unified Chain-Loop: 1 Click = 4 Assets)
  const performCloneAndCrush = async () => {
    if (!selectedVideo) {
      toast.error("Please select a competitor video from the matrix");
      return;
    }

    if (selectedVideo.isLocked && license.tier === "free") {
      toast.error("This recently viral video requires Pro. Unlock Pro for free through Referral Rewards.");
      return;
    }

    setIsRewriting(true);
    setActiveTab("script");

    const steps: { label: string; status: "pending" | "processing" | "success" | "error" }[] = [
      { label: "Establishing Secure Tunnel & Scraping Video Captions...", status: "processing" },
      { label: `Deploying ${selectedTier === "premium" ? "99% GLITCH PROTOCOL" : "60% Standard Optimization"}...`, status: "pending" },
      { label: "Enforcing Anti-Clone 'Stealth Disguise' Protocol...", status: "pending" },
      { label: `Injecting ${selectedTier === "premium" ? "EXTREME" : "Standard"} Curiosity Glitch into Title & Hook...`, status: "pending" },
      { label: "Reverse-Engineering Top Viral Thumbnail DNA...", status: "pending" },
      { label: "Compiling Unified Chain-Loop (5 Viral Assets Package)...", status: "pending" }
    ];
    setLogSteps(steps);

    try {
      const transcriptData = await transcriptMutation.mutateAsync({
        url: selectedVideo.url
      });

      if (!transcriptData.transcript || transcriptData.transcript.length < 10) {
        throw new Error("Target video transcript is empty or closed captions are disabled. Select a different video.");
      }

      steps[0].status = "success";
      steps[1].status = "processing";
      setLogSteps([...steps]);
      await new Promise(r => setTimeout(r, 600));

      steps[1].status = "success";
      steps[2].status = "processing";
      setLogSteps([...steps]);

      const rewriteRes = await cloneCrushMutation.mutateAsync({
        action: "rewrite",
        targetVideoId: selectedVideo.videoId,
        originalTranscript: transcriptData.transcript,
        originalTitle: selectedVideo.title,
        niche: nicheInput,
        tier: selectedTier
      });

      steps[2].status = "success";
      steps[3].status = "processing";
      setLogSteps([...steps]);
      await new Promise(r => setTimeout(r, 500));

      if (rewriteRes.success && rewriteRes.rewrite) {
        steps[3].status = "success";
        steps[4].status = "processing";
        setLogSteps([...steps]);

        const rw = rewriteRes.rewrite;

        // Step 5: Thumbnail Reverse-Engineering (runs in parallel with saving)
        let reverseEngineeredPrompts: string[] = [];
        let reverseEngineeredSource: any = null;

        try {
          const reverseRes = await cloneCrushMutation.mutateAsync({
            action: "thumbnail-reverse",
            glitchTitle: rw.rewrittenTitle,
            niche: nicheInput,
            tier: selectedTier,
          });
          const reverseData = reverseRes as any;
          if (reverseData.success && reverseData.thumbnailPrompts) {
            reverseEngineeredPrompts = reverseData.thumbnailPrompts;
            reverseEngineeredSource = reverseData.sourceVideo || null;
          }
        } catch {
          // Non-critical — fall back to the basic thumbnail prompt
        }

        steps[4].status = "success";
        steps[5].status = "processing";
        setLogSteps([...steps]);
        await new Promise(r => setTimeout(r, 300));

        const savedRewrite = addRewrite({
          targetVideoId: selectedVideo.videoId,
          targetVideoTitle: selectedVideo.title,
          originalTitle: rw.originalTitle,
          rewrittenTitle: rw.rewrittenTitle,
          glitchHook: rw.glitchHook,
          fullScript: rw.fullScript,
          retentionKeywordsUsed: rw.retentionKeywordsUsed,
          seoTags: rw.seoTags,
          thumbnailPrompt: rw.thumbnailPrompt,
          editingGuide: rw.editingGuide,
          tier: selectedTier,
          isStealthDisguised: true,
          changedAnalogiesCount: rw.changedAnalogiesCount,
          changedExamplesCount: rw.changedExamplesCount,
          glitchTechniques: rw.glitchTechniques,
          glitchIntensity: rw.glitchIntensity || (selectedTier === "premium" ? 99 : 60),
          reverseEngineeredPrompts,
          reverseEngineeredSource,
        });

        const promptCount = reverseEngineeredPrompts.length || 1;
        saveWorkflowPackage({
          rewriteId: savedRewrite.id,
          title: rw.rewrittenTitle,
          fullScript: rw.fullScript,
          thumbnailPrompt: rw.thumbnailPrompt,
          seoTags: rw.seoTags || [],
        });
        saveContent({
          type: "script",
          title: `Chain-Loop Asset Package: ${rw.rewrittenTitle.substring(0, 35)}...`,
          content: `⚡️ [GLITCH INTENSITY: ${rw.glitchIntensity || (selectedTier === "premium" ? 99 : 60)}%]\n\n⚡️ [TITLE & SEO TAGS]:\n${rw.rewrittenTitle}\nTags: ${rw.seoTags.join(', ')}\n\n⚡️ [15s GLITCH HOOK]:\n${rw.glitchHook}\n\n⚡️ [FULL SCRIPT]:\n${rw.fullScript}\n\n⚡️ [THUMBNAIL PROMPTS (${promptCount})]:\n${reverseEngineeredPrompts.length > 0 ? reverseEngineeredPrompts.map((p, i) => `${i+1}. ${p}`).join('\n\n') : rw.thumbnailPrompt}\n\n⚡️ [EDITING GUIDE]:\n${rw.editingGuide}`,
          metadata: { platform: "YouTube", style: selectedTier === "premium" ? "99% Glitch Protocol" : "60% Standard Optimization" }
        });
        incrementStat("scriptsGenerated");

        steps[5].status = "success";
        setLogSteps([...steps]);
        const intensityLabel = selectedTier === "premium" ? "99% GLITCH" : "60% Standard";
        toast.success(`🚀 ${intensityLabel} Chain-Loop Complete! ${promptCount > 1 ? promptCount + ' reverse-engineered thumbnail prompts' : '4 Viral Assets'} Generated.`);
      } else {
        throw new Error(rewriteRes.error || "Failed to compile Chain-Loop asset package");
      }

    } catch (err: any) {
      console.error(err);
      const failedSteps = steps.map(s => s.status === "processing" ? { ...s, status: "error" as const } : s);
      setLogSteps(failedSteps);
      toast.error(err.message || "Chain-Loop execution failed. Try selecting another video.");
    } finally {
      setIsRewriting(false);
    }
  };

  const handleSendToVoiceover = () => {
    if (!activeRewrite) return;
    startWorkflowHandoff("voice");
    toast.success("Script loaded into Voiceover Studio!");
    navigate("/voice");
  };

  const handleSendToRepurposer = () => {
    if (!activeRewrite) return;
    startWorkflowHandoff("repurposer");
    toast.success("Script loaded into Multi-Platform Repurposer!");
    navigate("/repurposer");
  };

  const handleCloneAndCrush = () => {
    if (!selectedVideo || (selectedVideo.isLocked && license.tier === "free")) return performCloneAndCrush();
    return runGuarded("unlock the next Clone & Crush result", performCloneAndCrush);
  };

  const handleCopyThumbnailPrompt = async () => {
    if (!activeRewrite) return;
    try {
      await navigator.clipboard.writeText(activeRewrite.thumbnailPrompt || "Cinematic YouTube thumbnail");
      toast.success("AI Thumbnail Prompt copied to clipboard! (Ready for Midjourney/DALL-E)");
    } catch {
      toast.error("Failed to copy");
    }
  };

  const handleCopySeoTags = async () => {
    if (!activeRewrite) return;
    try {
      const tagsStr = (activeRewrite.seoTags || []).join(", ");
      await navigator.clipboard.writeText(tagsStr);
      toast.success("SEO Tags copied to clipboard!");
    } catch {
      toast.error("Failed to copy");
    }
  };

  const handleCopyScript = async () => {
    if (!activeRewrite) return;
    const combinedText = `⚡️ TITLE:\n${activeRewrite.rewrittenTitle}\n\n⚡️ 15-SECOND GLITCH HOOK:\n${activeRewrite.glitchHook}\n\n⚡️ REWRITTEN SCRIPT:\n${activeRewrite.fullScript}`;
    try {
      await navigator.clipboard.writeText(combinedText);
      setCopiedText(true);
      toast.success("Script copied to clipboard!");
      setTimeout(() => setCopiedText(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const openReferralRewards = () => navigate("/rewards");

  return (
    <div className="space-y-6 md:space-y-8 animate-fade-in pb-12">
      {/* Page Title & Badges */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2">
            <Zap className="w-7 h-7 md:w-8 md:h-8 text-primary animate-pulse" />
            Clone &amp; Crush AI
            <span className="px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] border border-primary/20 font-display font-medium tracking-wide">
              Viral Chain-Loop (1 Click = 4 Assets)
            </span>
          </h1>
          <p className="text-sm md:text-base text-muted-foreground mt-1 max-w-3xl">
            Auto-profile your channel, engage our Versus Showdown live velocity competitor audit, and deploy our proprietary <span className="text-foreground font-semibold">Stealth Disguise Protocol</span> with instant No-Click Handoff.
          </p>
        </div>

        {/* License Tier Badge */}
        <div className="flex items-center gap-3">
          <div className="p-3 bg-card border border-border rounded-xl flex items-center gap-3">
            <Award className="w-5 h-5 text-primary" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Subscription Status</p>
              <p className="text-sm font-bold text-foreground capitalize">{license.tier} Plan</p>
            </div>
            {license.tier === "free" && (
              <Button size="sm" onClick={openReferralRewards} className="cyber-button text-[10px] px-3 h-8 font-display bg-primary text-primary-foreground">
                Unlock Pro for Free
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: SETUP & SHOWDOWN MATRIX (8 columns on LG) */}
        <div className="lg:col-span-8 space-y-6 md:space-y-8">
          
          {/* STEP 1: Paste URL & Auto-Profile */}
          <Card className="cyber-card border-border">
            <CardHeader className="pb-3 md:pb-4">
              <CardTitle className="font-display text-base md:text-lg text-foreground flex items-center gap-2">
                <Compass className="w-5 h-5 text-primary" />
                1. Auto-Profile Your Channel (Zero-Friction URL Input)
              </CardTitle>
              <CardDescription className="text-xs md:text-sm text-muted-foreground">
                Paste your YouTube URL or Handle. The AI automatically deduces your niche and launches the live Versus Showdown matrix.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Youtube className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="YouTube Channel URL or Handle (e.g. @MrBeast)"
                    value={channelInput}
                    onChange={(e) => setChannelInput(e.target.value)}
                    className="pl-10 bg-secondary/40 border-border/80 focus-visible:ring-primary/40 h-11 text-sm text-foreground placeholder:text-muted-foreground/60"
                  />
                </div>
                <Button 
                  onClick={handleProfileChannel} 
                  disabled={isProfiling} 
                  className="cyber-button px-5 h-11 shrink-0 font-display text-sm flex gap-2"
                >
                  {isProfiling ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Profiling...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-primary-foreground fill-primary-foreground" />
                      Launch Showdown
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* THREAT ALERTS — Live Threat Detection */}
          {threatAlerts.length > 0 && (
            <div className="space-y-2 animate-fade-in">
              {threatAlerts.slice(0, 3).map((alert, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-xl border flex items-start gap-3 ${
                    alert.type === 'critical'
                      ? 'bg-red-500/10 border-red-500/30 animate-pulse'
                      : alert.type === 'warning'
                      ? 'bg-yellow-500/10 border-yellow-500/20'
                      : 'bg-blue-500/10 border-blue-500/20'
                  }`}
                >
                  <span className="text-lg shrink-0">{alert.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-bold ${
                      alert.type === 'critical' ? 'text-red-400' : alert.type === 'warning' ? 'text-yellow-400' : 'text-blue-400'
                    }`}>
                      {alert.message}
                    </p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[9px] text-muted-foreground">Urgency: {alert.urgencyScore}/100</span>
                      <span className="text-[9px] text-muted-foreground">{alert.hoursAgo < 1 ? 'Just now' : `${Math.round(alert.hoursAgo)}h ago`}</span>
                    </div>
                  </div>
                  {alert.type === 'critical' && (
                    <Link to="/clone-crush" className="shrink-0">
                      <Button size="sm" className="cyber-button text-[9px] h-7 px-2 font-display">
                        <Zap className="w-3 h-3 text-primary-foreground fill-primary-foreground" />
                        Crush Now
                      </Button>
                    </Link>
                  )}
                </div>
              ))}

              {/* Widening Gap Indicator */}
              {wideningGap && wideningGap.dailyLoss > 0 && (
                <div className="p-3 rounded-xl bg-gradient-to-r from-red-500/5 via-card to-red-500/5 border border-red-500/15 flex items-center gap-3">
                  <TrendingUp className="w-4 h-4 text-red-400 shrink-0" />
                  <div className="flex-1">
                    <p className="text-[10px] font-bold text-red-400 font-display uppercase tracking-wider">
                      📉 Widening Gap: ~${wideningGap.dailyLoss.toLocaleString()}/day
                    </p>
                    <p className="text-[9px] text-muted-foreground mt-0.5">{wideningGap.message}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-display font-bold text-red-400">${wideningGap.monthlyLoss.toLocaleString()}</p>
                    <p className="text-[8px] text-muted-foreground">Monthly gap</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* CRITICAL FIX 1: SIDE-BY-SIDE SHOWDOWN MATRIX (VERSUS MODE) */}
          {profile && (
            <div className="grid lg:grid-cols-12 gap-4 items-center animate-fade-in p-4 rounded-2xl bg-secondary/20 border border-border/60">
              
              {/* Left Side: User's Profile Card (5 cols) */}
              <div className="lg:col-span-5 h-full">
                <Card className="cyber-card border-primary/40 bg-card/95 p-5 h-full flex flex-col justify-between shadow-neon-glow">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] font-mono uppercase bg-primary/20 text-primary px-2.5 py-0.5 rounded-full font-bold">
                        Your Channel Profile
                      </span>
                      <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                    </div>
                    <div className="flex items-center gap-3.5 mt-2">
                      <img src={profile.avatar} alt={profile.name} className="w-14 h-14 rounded-full border-2 border-primary/50 object-cover bg-card shadow-md shrink-0" />
                      <div className="min-w-0">
                        <p className="text-base font-bold text-foreground truncate">{profile.name}</p>
                        <p className="text-xs text-primary font-medium mt-0.5">{profile.handle}</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-3 line-clamp-3 leading-relaxed">
                      {profile.description}
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>AI Niche: <strong className="text-foreground">{nicheInput || "Auto-Deduced"}</strong></span>
                    <span className="text-green-400 font-semibold">Active</span>
                  </div>
                </Card>
              </div>

              {/* Center Divider: Glowing RED Lightning Bolt VS Divider (2 cols) */}
              <div className="lg:col-span-2 flex flex-col items-center justify-center py-2 lg:py-0">
                <div className="relative flex items-center justify-center">
                  <div className="absolute inset-0 bg-red-500/30 rounded-full blur-xl animate-pulse" />
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-red-600 to-rose-950 border-2 border-red-500 flex items-center justify-center shadow-[0_0_30px_rgba(239,68,68,0.9)] relative z-10 animate-pulse">
                    <Zap className="w-7 h-7 text-white fill-white animate-bounce" />
                  </div>
                </div>
                <span className="text-[11px] font-display font-extrabold text-red-500 tracking-widest mt-2 uppercase drop-shadow-[0_0_10px_rgba(239,68,68,0.8)]">
                  VS SHOWDOWN
                </span>
              </div>

              {/* Right Side: Auto-Competitor Matrix - 1 unlocked, 2 locked (5 cols) */}
              <div className="lg:col-span-5 h-full">
                <Card className="cyber-card border-border/80 bg-card/95 p-5 h-full flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] font-mono uppercase bg-red-500/10 text-red-400 border border-red-500/20 px-2.5 py-0.5 rounded-full font-bold">
                        Live Velocity Matrix
                      </span>
                      <span className="text-xs text-muted-foreground">{competitors.length} Viral Outliers</span>
                    </div>

                    {isSearchingCompetitors ? (
                      <div className="py-10 text-center space-y-2">
                        <Loader2 className="w-7 h-7 animate-spin text-primary mx-auto" />
                        <p className="text-xs text-muted-foreground">Auditing real-time viral velocity &amp; recency bias...</p>
                      </div>
                    ) : competitors.length > 0 ? (
                      <div className="grid grid-cols-3 gap-2 mt-2">
                        {competitors.map((video, idx) => {
                          const isSelected = selectedVideo?.videoId === video.videoId;
                          const velocityColor = (video.viralVelocityScore || 0) >= 70 ? 'text-red-400' : (video.viralVelocityScore || 0) >= 40 ? 'text-yellow-400' : 'text-green-400';
                          return (
                            <div
                              key={video.videoId}
                              onClick={() => {
                                if (video.isLocked) return;
                                setSelectedVideo(video);
                                selectWorkflowCompetitor({
                                  videoId: video.videoId,
                                  title: video.title,
                                  url: video.url,
                                  channelName: video.channelName,
                                  thumbnail: video.thumbnail,
                                }, nicheInput);
                              }}
                              className={`group relative rounded-xl border p-2 cursor-pointer transition-all duration-300 flex flex-col justify-between bg-secondary/30 ${
                                isSelected 
                                  ? "border-primary bg-primary/15 ring-2 ring-primary/60 shadow-neon-glow" 
                                  : "border-border/60 hover:border-border"
                              } ${video.isLocked ? "pointer-events-none" : ""}`}
                            >
                              <div className="absolute top-1 left-1 z-10 bg-primary text-primary-foreground text-[7px] font-bold px-1.5 py-0.5 rounded-full">
                                {idx === 0 ? "Unlocked" : `Locked #${idx}`}
                              </div>
                              <div className="relative aspect-video rounded-lg overflow-hidden bg-black/60 shrink-0 mb-1.5">
                                <img 
                                  src={video.thumbnail} 
                                  alt={video.title} 
                                  className={`w-full h-full object-cover ${video.isLocked ? "blur-sm opacity-40" : ""}`}
                                />
                                {video.isLocked && (
                                  <div className="absolute inset-0 flex flex-col items-center justify-center p-1 text-center bg-black/80">
                                    <Lock className="w-4 h-4 text-primary animate-pulse mb-1" />
                                    <span className="text-[7px] font-bold text-foreground">PRO LOCKED</span>
                                  </div>
                                )}
                              </div>
                              <div>
                                <p className="text-[9px] font-bold line-clamp-2 text-foreground leading-tight">{video.title}</p>
                                <p className="text-[8px] text-primary font-mono mt-1 font-semibold">{video.views}</p>
                                {/* FOMO Metrics */}
                                <div className="flex items-center gap-1.5 mt-1">
                                  {video.estimatedRevenue && (
                                    <span className="text-[7px] font-bold text-green-400 bg-green-400/10 px-1 py-0.5 rounded flex items-center gap-0.5">
                                      <DollarSign className="w-2.5 h-2.5" />
                                      {video.estimatedRevenue}
                                    </span>
                                  )}
                                  {video.viralVelocityScore !== undefined && (
                                    <span className={`text-[7px] font-bold ${velocityColor} bg-secondary/60 px-1 py-0.5 rounded flex items-center gap-0.5`}>
                                      <Flame className="w-2.5 h-2.5" />
                                      {video.viralVelocityScore}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="py-8 text-center text-xs text-muted-foreground">
                        Profile your channel above to launch the live velocity showdown matrix.
                      </div>
                    )}
                  </div>

                  {/* Pro upgrade banner if locked competitors */}
                  {competitors.some(v => v.isLocked) && license.tier === "free" && (
                    <div className="mt-3 p-2.5 rounded-lg bg-gradient-to-r from-primary/10 via-secondary/40 to-accent/10 border border-primary/20 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Lock className="w-4 h-4 text-primary shrink-0" />
                        <p className="text-[10px] font-bold text-foreground truncate">Unlock 2 Additional Hidden Trend Competitors</p>
                      </div>
                      <Button onClick={openReferralRewards} size="sm" className="cyber-button text-[10px] shrink-0 font-display h-7 px-2.5">
                        Unlock Pro for Free
                      </Button>
                    </div>
                  )}
                </Card>
              </div>

            </div>
          )}

          {/* ENVY ENGINE — Revenue Gap & Velocity Alert */}
          {envyMetrics && competitors.length > 0 && (
            <div className="grid grid-cols-3 gap-3 animate-fade-in">
              <div className="p-3 rounded-xl bg-gradient-to-br from-green-500/10 to-green-500/5 border border-green-500/20">
                <p className="text-[10px] text-green-400 font-mono uppercase tracking-wider font-bold flex items-center gap-1">
                  <DollarSign className="w-3 h-3" /> Competitor Revenue
                </p>
                <p className="text-lg font-display font-bold text-green-400 mt-1">
                  {envyMetrics.totalCompetitorMonthlyRevenue}
                </p>
                <p className="text-[9px] text-muted-foreground mt-0.5">Estimated combined/mo</p>
              </div>
              <div className="p-3 rounded-xl bg-gradient-to-br from-red-500/10 to-red-500/5 border border-red-500/20">
                <p className="text-[10px] text-red-400 font-mono uppercase tracking-wider font-bold flex items-center gap-1">
                  <Flame className="w-3 h-3" /> Viral Velocity
                </p>
                <p className="text-lg font-display font-bold text-red-400 mt-1">
                  {envyMetrics.averageViralVelocity}/100
                </p>
                <p className="text-[9px] text-muted-foreground mt-0.5">Avg competitor score</p>
              </div>
              <div className="p-3 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20">
                <p className="text-[10px] text-primary font-mono uppercase tracking-wider font-bold flex items-center gap-1">
                  <Gauge className="w-3 h-3" /> Niche CPM
                </p>
                <p className="text-lg font-display font-bold text-primary mt-1">
                  {envyMetrics.nicheCpm}
                </p>
                <p className="text-[9px] text-muted-foreground mt-0.5">{envyMetrics.niche}</p>
              </div>
            </div>
          )}

          {/* STEP 3: Rewrite Customizer & Terminal Logs */}
          {selectedVideo && (
            <Card className="cyber-card border-border">
              <CardHeader className="pb-3 md:pb-4">
                <CardTitle className="font-display text-base md:text-lg text-foreground flex items-center gap-2">
                  <Zap className="w-5 h-5 text-primary" />
                  3. The Chain-Loop Loophole Configurator (1 Click = 4 Assets)
                </CardTitle>
                <CardDescription className="text-xs md:text-sm text-muted-foreground">
                  Choose your loophole copy intensity. Generates script, SEO tags, AI thumbnail prompt, and editing guide simultaneously.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                
                {/* Loophole Toggles */}
                <div className="grid grid-cols-2 gap-4">
                  <div 
                    onClick={() => setSelectedVideoTier("free")}
                    className={`rounded-xl border p-4 cursor-pointer transition-all ${
                      selectedTier === "free" 
                        ? "border-primary bg-primary/5 ring-1 ring-primary/30" 
                        : "border-border/60 hover:border-border bg-secondary/10"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <input 
                        type="radio" 
                        checked={selectedTier === "free"} 
                        onChange={() => {}}
                        className="accent-primary" 
                      />
                      <p className="text-sm font-bold text-foreground">60% Loophole (Vibe-Extract)</p>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      Extracts core points and insights but writes an entirely new narrative flow, layout, and hook. 100% fresh pacing.
                    </p>
                  </div>

                  <div 
                    onClick={() => {
                      if (license.tier === "free") {
                        toast.error("99% Glitch Protocol is reserved for Pro and Enterprise plans.");
                        return;
                      }
                      setSelectedVideoTier("premium");
                    }}
                    className={`rounded-xl border p-4 cursor-pointer transition-all ${
                      license.tier === "free" ? "opacity-50" : ""
                    } ${
                      selectedTier === "premium" 
                        ? "border-primary bg-primary/5 ring-1 ring-primary/30" 
                        : "border-border/60 hover:border-border bg-secondary/10"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2">
                        <input 
                          type="radio" 
                          checked={selectedTier === "premium"} 
                          onChange={() => {}}
                          disabled={license.tier === "free"}
                          className="accent-primary" 
                        />
                        <p className="text-sm font-bold text-foreground">99% Glitch Protocol (Maximum Aggression)</p>
                      </div>
                      {license.tier === "free" && (
                        <Lock className="w-3.5 h-3.5 text-primary" />
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      Injects extreme Curiosity Glitches: time-jumps, hidden secrets, shocking mistakes. Reverse-engineers proven viral thumbnails with ruthless precision.
                    </p>
                  </div>
                </div>

                <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl flex gap-3 items-start">
                  <ShieldAlert className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-yellow-500">The Stealth Disguise Protocol Active</p>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      All script outcomes automatically deploy our Anti-Clone Illusion: original analogies are fully discarded, case studies are swapped for equally powerful alternatives, and vocabularies are completely updated.
                    </p>
                  </div>
                </div>

                <Button 
                  onClick={handleCloneAndCrush} 
                  disabled={isRewriting} 
                  className="w-full h-12 bg-gradient-to-r from-primary to-accent text-primary-foreground font-display font-bold uppercase tracking-wider text-sm flex gap-2"
                >
                  {isRewriting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Executing Chain-Loop (4 Assets)...
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 fill-primary-foreground" />
                      Execute Chain-Loop (1 Click = 4 Viral Assets)
                    </>
                  )}
                </Button>

                {/* LOGS TERMINAL */}
                {logSteps.length > 0 && (
                  <div className="font-mono bg-black rounded-xl border border-border/80 p-4 text-xs space-y-2 max-h-[220px] overflow-y-auto">
                    <p className="text-primary font-bold border-b border-border/50 pb-1.5 flex items-center justify-between">
                      <span>⚡️ CHAIN-LOOP CONSOLE LOGS:</span>
                      <span className="text-[9px] bg-primary/20 px-2 py-0.5 rounded text-primary animate-pulse">Running</span>
                    </p>
                    {logSteps.map((step, idx) => (
                      <div key={idx} className="flex items-center justify-between text-muted-foreground leading-relaxed">
                        <span className="flex items-center gap-2">
                          <ChevronRight className="w-3 h-3 text-primary shrink-0" />
                          <span className={step.status === "error" ? "text-destructive" : step.status === "success" ? "text-green-400 font-semibold" : ""}>
                            {step.label}
                          </span>
                        </span>
                        <span>
                          {step.status === "pending" && <span className="text-muted-foreground/30">PENDING</span>}
                          {step.status === "processing" && <span className="text-primary animate-pulse">PROCESSING</span>}
                          {step.status === "success" && <span className="text-green-400">DONE</span>}
                          {step.status === "error" && <span className="text-destructive font-bold">FAILED</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

              </CardContent>
            </Card>
          )}

        </div>

        {/* RIGHT COLUMN: REWRITE HISTORY & OUTPUT (4 columns on LG) */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* SCRIPT RESULTS & CHAIN-LOOP ACTION HUB */}
          {activeRewrite ? (
            <Card className="cyber-card border-primary/40 shadow-neon-glow animate-fade-in">
              <CardHeader className="pb-3 md:pb-4 border-b border-border/40">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-[9px] font-mono tracking-widest uppercase">
                      Chain-Loop Master Package
                    </span>
                    <CardTitle className="font-display text-base md:text-lg text-foreground mt-2 line-clamp-2">
                      {activeRewrite.rewrittenTitle}
                    </CardTitle>
                    <p className="text-[10px] text-muted-foreground truncate mt-1">
                      Based on: {activeRewrite.targetVideoTitle}
                    </p>
                  </div>
                  
                  <Button 
                    variant="outline" 
                    size="icon" 
                    onClick={handleCopyScript} 
                    className="shrink-0 border-border hover:border-primary/40 text-muted-foreground hover:text-primary active:scale-95"
                  >
                    {copiedText ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-5 space-y-5">
                
                {/* ADDICTIVE UX: NO-CLICK HANDOFF PROTOCOL ACTION HUB */}
                <div className="p-4 rounded-xl bg-gradient-to-r from-primary/15 via-secondary/60 to-accent/15 border border-primary/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-display font-bold text-foreground flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-primary animate-pulse" />
                      Chain-Loop Complete: 4 Assets Ready
                    </p>
                    <span className="text-[10px] bg-primary text-primary-foreground font-mono font-bold px-2 py-0.5 rounded-full uppercase">
                      No-Click Handoff
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
                    <Button 
                      onClick={handleSendToVoiceover} 
                      size="sm" 
                      className="cyber-button text-xs h-9 font-display gap-1.5 justify-start px-3"
                    >
                      <Mic className="w-3.5 h-3.5 text-primary-foreground shrink-0" />
                      <span>Send to Voiceover</span>
                    </Button>
                    <Button
                      onClick={handleSendToRepurposer}
                      size="sm"
                      variant="outline"
                      className="border-border hover:border-primary/50 text-xs h-9 font-display gap-1.5 justify-start px-3"
                    >
                      <Share2 className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span>Repurpose Content</span>
                    </Button>
                    <Button 
                      onClick={handleCopyThumbnailPrompt} 
                      size="sm" 
                      variant="outline" 
                      className="border-border hover:border-primary/50 text-xs h-9 font-display gap-1.5 justify-start px-3"
                    >
                      <Image className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span>Copy Thumbnail Prompt</span>
                    </Button>
                    <Button 
                      onClick={handleCopySeoTags} 
                      size="sm" 
                      variant="outline" 
                      className="border-border hover:border-primary/50 text-xs h-9 font-display gap-1.5 justify-start px-3"
                    >
                      <Search className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span>Copy SEO Tags</span>
                    </Button>
                  </div>
                </div>

                {/* GLITCH INTENSITY INDICATOR */}
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-display font-bold text-foreground uppercase tracking-wider">Glitch Intensity</span>
                      <span className={`text-xs font-mono font-bold ${
                        (activeRewrite.glitchIntensity || 60) >= 90 ? 'text-red-400' : 'text-yellow-400'
                      }`}>
                        {activeRewrite.glitchIntensity || 60}%
                      </span>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-1000 ${
                          (activeRewrite.glitchIntensity || 60) >= 90
                            ? 'bg-gradient-to-r from-red-600 via-red-400 to-orange-400'
                            : 'bg-gradient-to-r from-yellow-600 via-yellow-400 to-green-400'
                        }`}
                        style={{ width: `${activeRewrite.glitchIntensity || 60}%` }}
                      />
                    </div>
                  </div>
                  {activeRewrite.glitchTechniques && activeRewrite.glitchTechniques.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {activeRewrite.glitchTechniques.map((tech, i) => (
                        <span key={i} className="text-[8px] font-mono bg-red-500/10 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded">
                          {tech}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* HIGH-CURIOSITY GLITCH HOOK HAZARD CARD */}
                <div className="relative rounded-xl border border-destructive/30 bg-destructive/5 p-4 overflow-hidden shadow-sm animate-pulse-subtle">
                  <div className="absolute top-0 right-0 w-20 h-20 bg-destructive/10 rounded-full blur-xl" />
                  <div className="flex items-start gap-3 relative z-10">
                    <ShieldAlert className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-bold text-destructive font-display uppercase tracking-wider">
                        15s Glitch Hook ({(activeRewrite.glitchIntensity || 60) >= 90 ? 'EXTREME' : 'Standard'} Pattern Interrupt)
                      </p>
                      <p className="text-xs text-foreground mt-1.5 leading-relaxed font-medium italic">
                        "{activeRewrite.glitchHook}"
                      </p>
                    </div>
                  </div>
                </div>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                  <TabsList className="grid grid-cols-4 bg-secondary/60 border border-border h-9 rounded-lg">
                    <TabsTrigger value="script" className="text-[11px] font-semibold rounded-md">Script</TabsTrigger>
                    <TabsTrigger value="thumbnail" className="text-[11px] font-semibold rounded-md">Thumbnail</TabsTrigger>
                    <TabsTrigger value="tags" className="text-[11px] font-semibold rounded-md">Tags</TabsTrigger>
                    <TabsTrigger value="guide" className="text-[11px] font-semibold rounded-md">Guide</TabsTrigger>
                  </TabsList>

                  {/* SCRIPT CONTENT */}
                  <TabsContent value="script" className="pt-3">
                    <div className="rounded-xl border border-border/80 bg-secondary/30 p-4 h-[300px] overflow-y-auto font-sans text-xs md:text-sm text-foreground leading-relaxed whitespace-pre-wrap select-text scrollbar-thin">
                      {activeRewrite.fullScript}
                    </div>
                  </TabsContent>

                  {/* THUMBNAIL PROMPT CONTENT — Reverse-Engineered or Basic */}
                  <TabsContent value="thumbnail" className="pt-3 space-y-3">
                    {activeRewrite.reverseEngineeredPrompts && activeRewrite.reverseEngineeredPrompts.length > 0 ? (
                      <>
                        {/* Reverse-Engineered Thumbnail Source */}
                        {activeRewrite.reverseEngineeredSource && (
                          <div className="p-2.5 bg-green-500/10 rounded-xl border border-green-500/20 flex items-center gap-3">
                            <img
                              src={activeRewrite.reverseEngineeredSource.thumbnailUrl}
                              alt="Source thumbnail"
                              className="w-16 h-9 rounded object-cover bg-black/40 shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] font-bold text-green-400">🔬 Reverse-Engineered from Viral Thumbnail</p>
                              <p className="text-[9px] text-muted-foreground truncate">{activeRewrite.reverseEngineeredSource.title}</p>
                              <p className="text-[9px] text-muted-foreground">{activeRewrite.reverseEngineeredSource.views} • {activeRewrite.reverseEngineeredSource.channel}</p>
                            </div>
                          </div>
                        )}
                        {/* 4 Reverse-Engineered Prompts */}
                        {activeRewrite.reverseEngineeredPrompts.map((prompt, i) => (
                          <div key={i} className="p-3 bg-secondary/40 rounded-xl border border-border/60">
                            <div className="flex items-center justify-between mb-1.5">
                              <p className="text-xs font-bold text-foreground">
                                {(activeRewrite.glitchIntensity || 60) >= 90 ? '🎯' : '🎨'} Prompt {i + 1}: {
                                  ['Curiosity Gap', 'Shock/Fear', 'Authority/Proof', 'Number/List'][i] || 'Visual'
                                }
                              </p>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-[10px]"
                                onClick={async () => {
                                  try {
                                    await navigator.clipboard.writeText(prompt);
                                    toast.success(`Prompt ${i + 1} copied!`);
                                  } catch { toast.error("Failed to copy"); }
                                }}
                              >
                                <Copy className="w-3 h-3" />
                              </Button>
                            </div>
                            <p className="text-[10px] font-mono text-primary bg-secondary/80 p-2.5 rounded-lg border border-primary/20 select-all leading-relaxed">
                              {prompt}
                            </p>
                          </div>
                        ))}
                      </>
                    ) : (
                      <>
                        <div className="p-3 bg-secondary/40 rounded-xl border border-border/60">
                          <p className="text-xs font-bold text-foreground mb-1">AI Thumbnail Prompt (Midjourney / DALL-E Ready):</p>
                          <p className="text-xs font-mono text-primary bg-secondary/80 p-3 rounded-lg border border-primary/20 select-all leading-relaxed">
                            {activeRewrite.thumbnailPrompt}
                          </p>
                        </div>
                        <Button onClick={handleCopyThumbnailPrompt} size="sm" className="w-full cyber-button text-xs h-9">
                          <Copy className="w-3.5 h-3.5 mr-2" /> Copy Prompt for Midjourney
                        </Button>
                      </>
                    )}
                  </TabsContent>

                  {/* SEO TAGS CONTENT */}
                  <TabsContent value="tags" className="pt-3 space-y-3">
                    <div className="p-3 bg-secondary/40 rounded-xl border border-border/60">
                      <p className="text-xs font-bold text-foreground mb-2">High-CTR SEO Tags:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(activeRewrite.seoTags || []).map((tag, i) => (
                          <span key={i} className="text-[10px] font-mono bg-primary/10 text-primary border border-primary/20 px-2 py-1 rounded-md">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <Button onClick={handleCopySeoTags} size="sm" className="w-full cyber-button text-xs h-9">
                      <Copy className="w-3.5 h-3.5 mr-2" /> Copy All SEO Tags
                    </Button>
                  </TabsContent>

                  {/* EDITING & VISUAL GUIDE CONTENT */}
                  <TabsContent value="guide" className="pt-3">
                    <div className="rounded-xl border border-border/80 bg-secondary/30 p-4 h-[300px] overflow-y-auto font-sans text-xs text-foreground leading-relaxed whitespace-pre-wrap select-text scrollbar-thin">
                      {activeRewrite.editingGuide}
                    </div>
                  </TabsContent>
                </Tabs>

              </CardContent>
            </Card>
          ) : (
            <Card className="cyber-card border-border p-6 text-center h-[420px] flex flex-col justify-center items-center">
              <div className="w-16 h-16 rounded-2xl bg-secondary/60 flex items-center justify-center mb-4 border border-border">
                <FileText className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-base text-foreground font-bold">No Active Chain-Loop Package</p>
              <p className="text-xs text-muted-foreground max-w-[250px] mt-2 leading-relaxed">
                Profile your channel, select a video from the Showdown Matrix, and hit <strong className="text-foreground">Execute Chain-Loop</strong>.
              </p>
            </Card>
          )}

          {/* HISTORIC SCRIPT LIST */}
          <Card className="cyber-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-sm font-semibold text-foreground flex items-center gap-2">
                <History className="w-4 h-4 text-primary" />
                Historic Chain-Loop Packages ({rewrites.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              {rewrites.length > 0 ? (
                <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                  {rewrites.map((r) => {
                    const isSelected = activeRewrite?.id === r.id;
                    return (
                      <div 
                        key={r.id}
                        className={`group relative flex items-center justify-between p-2.5 rounded-lg border text-left cursor-pointer transition-colors ${
                          isSelected 
                            ? "border-primary bg-primary/10" 
                            : "border-border/40 hover:border-border bg-secondary/10"
                        }`}
                      >
                        <div onClick={() => setActiveRewrite(r)} className="flex-1 min-w-0 pr-6">
                          <p className="text-[11px] font-bold text-foreground truncate">{r.rewrittenTitle}</p>
                          <p className="text-[9px] text-muted-foreground truncate mt-0.5">
                            {r.tier === "premium" ? "99% Glitch" : "60% Standard"} • {r.glitchIntensity || (r.tier === "premium" ? 99 : 60)}% • {new Date(r.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteRewrite(r.id);
                            toast.success("Chain-Loop package removed");
                          }}
                          className="absolute right-2 opacity-0 group-hover:opacity-100 hover:text-destructive text-muted-foreground transition-all duration-200"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground/60 text-xs">
                  Your generated Chain-Loop packages will appear here.
                </div>
              )}
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
}
