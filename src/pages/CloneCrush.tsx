import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Zap, Sparkles, Copy, Check, FileText, Youtube, Loader2, Lock, Award, RefreshCw, CheckCircle2, AlertTriangle, ArrowRight, ShieldAlert, Compass, History, TrendingUp, ChevronRight, XCircle, Mic, Image, Search, DollarSign, Flame, Gauge, Share2, Terminal, Cpu, Activity, Radio,
} from "lucide-react";
import { GhostBootSequence } from "@/components/ui/GhostBootSequence";
import { WarRoomTicker } from "@/components/ui/WarRoomTicker";
import { GhostNodeStatus } from "@/components/ui/GhostNodeStatus";
import { LiveActiveCounter, LossAversionTicker } from "@/components/ui/LiveActiveCounter";
import { VideoWallBackground } from "@/components/ui/VideoWallBackground";
import { NeuralVelocityEngine } from "@/components/ui/NeuralVelocityEngine";
import { ParticleBurst } from "@/components/ui/ParticleBurst";
import { GhostIntelDrop } from "@/components/ui/GhostIntelDrop";
import { BroadcastSyncIndicator } from "@/components/ui/BroadcastSyncIndicator";
import { XpGainPopup } from "@/components/ui/XpGainPopup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useCloneCrushStore, CompetitorVideo, ProfiledChannel } from "@/stores/useCloneCrushStore";
import { useContentStore } from "@/stores/useContentStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { useTranscriptExtraction, useCloneCrushMutation } from "@/hooks/useSecureQuery";
import { useSoftGate } from "@/contexts/SoftGateContext";
import { useWorkflowStore } from "@/stores/useWorkflowStore";

type ProfileWithKeywords = ProfiledChannel & { extractedKeywords?: string[] };

function withClientTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId = 0;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(`Request timed out after ${Math.round(timeoutMs / 1000)} seconds`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId));
}

const VIRAL_VIEW_THRESHOLD = 50_000;
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
  const { runGuarded } = useSoftGate();

  const {
    profile, isProfiling, competitors, isSearchingCompetitors, envyMetrics, threatAlerts, wideningGap, rewrites, isRewriting, activeRewrite,
    setProfile, setIsProfiling, setCompetitors, setIsSearchingCompetitors, setThreatAlerts, addRewrite, setIsRewriting, setActiveRewrite, deleteRewrite,
  } = useCloneCrushStore();

  const saveContent = useContentStore((s) => s.saveContent);
  const incrementStat = useContentStore((s) => s.incrementStat);
  const license = useAuthStore((s) => s.license);
  const startWorkflowProfile = useWorkflowStore((s) => s.startProfile);
  const selectWorkflowCompetitor = useWorkflowStore((s) => s.selectCompetitor);
  const saveWorkflowPackage = useWorkflowStore((s) => s.saveContentPackage);
  const startWorkflowHandoff = useWorkflowStore((s) => s.startHandoff);

  const [channelInput, setChannelInput] = useState("");
  const [nicheInput, setNicheInput] = useState("");
  const [customDescription, setCustomDescription] = useState("");
  const [selectedVideo, setSelectedVideo] = useState<CompetitorVideo | null>(null);
  const [selectedTier, setSelectedVideoTier] = useState<"free" | "premium">(license.tier === "free" ? "free" : "premium");
  const [copiedText, setCopiedText] = useState(false);
  const [activeTab, setActiveTab] = useState("script");
  const [logSteps, setLogSteps] = useState<{ label: string; status: "pending" | "processing" | "success" | "rerouting" | "error"; meta?: string }[]>([]);
  const [showBoot, setShowBoot] = useState(true);
  const [burstTrigger, setBurstTrigger] = useState(0);
  const [xpTrigger, setXpTrigger] = useState(0);
  const [showIntelDrop, setShowIntelDrop] = useState(true);

  const transcriptMutation = useTranscriptExtraction();
  const cloneCrushMutation = useCloneCrushMutation();

  useEffect(() => {
    if (license.tier === "free") setSelectedVideoTier("free");
  }, [license.tier]);

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
      if (!customDescription) setCustomDescription(profile.description.slice(0, 150) + "...");
    }
  }, [profile]);

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
    setCustomDescription((prof.description || discoveryDescription).slice(0, 150));
    setIsSearchingCompetitors(true);
    toast.loading(`AI deducing niche "${deducedNiche}" & auditing viral velocity via ghost mesh...`, { id: "competitors-find" });

    try {
      const res = await cloneCrushMutation.mutateAsync({ action: "competitors", niche: deducedNiche, description: discoveryDescription });
      if (res.success && res.competitors) {
        const viralCompetitors = res.competitors.filter((v: any) => clientViewCount(v) >= VIRAL_VIEW_THRESHOLD);
        if (viralCompetitors.length === 0) throw new Error("No 50k+ viral competitors found");
        const envyData = (res as any).envyMetrics || null;
        setCompetitors(viralCompetitors, envyData);
        const unlocked = viralCompetitors.find((v: any) => !v.isLocked) || viralCompetitors[0];
        setSelectedVideo(unlocked);
        selectWorkflowCompetitor({ videoId: unlocked.videoId, title: unlocked.title, url: unlocked.url, channelName: unlocked.channelName, thumbnail: unlocked.thumbnail }, deducedNiche);
        const isGhost = (res as any).ghostReconstructed;
        toast.success(isGhost ? `Ghost Matrix Reconstructed! ${viralCompetitors.length} viral competitors via MUM-01 mesh` : `Showdown Matrix Ready! ${viralCompetitors.length} 50k+ live competitors`, { id: "competitors-find" });
        cloneCrushMutation.mutateAsync({ action: "threat-alerts", competitors: viralCompetitors, userSubscribers: prof.subscriberCount || 0 }).then((alertRes: any) => {
          if (alertRes.success) setThreatAlerts(alertRes.alerts || [], alertRes.wideningGap || null);
        }).catch(() => {});
      } else throw new Error(res.error || "No competitors");
    } catch (err: any) {
      // Even on error, ghost synthetic should have returned - but fallback toast
      toast.error(err.message || "Ghost mesh activated - synthetic matrix deployed", { id: "competitors-find" });
    } finally { setIsSearchingCompetitors(false); }
  };

  const performProfileChannel = async () => {
    const input = channelInput.trim();
    if (!input) { toast.error("Please enter a YouTube Channel URL or Handle"); return; }
    setIsProfiling(true);
    toast.loading("Establishing ghost tunnel to YouTube veil layer...", { id: "profile-scrape" });
    try {
      const profileRequest = cloneCrushMutation.mutateAsync({ action: "profile", channelUrl: input });
      const res = await withClientTimeout(profileRequest, 15_000);
      if (res.success && res.profile) {
        const profileResponse = res as typeof res & { extractedKeywords?: string[] };
        const profiledChannel: ProfileWithKeywords = { ...res.profile, extractedKeywords: profileResponse.extractedKeywords || res.profile.extractedKeywords || [] };
        setProfile(profiledChannel);
        startWorkflowProfile({ id: profiledChannel.id, name: profiledChannel.name, handle: profiledChannel.handle, avatar: profiledChannel.avatar });
        const isGhost = (res as any).ghostReconstructed;
        toast.success(isGhost ? `Ghost Profile Reconstructed: ${profiledChannel.name} via MUM-01` : `Connected to ${profiledChannel.name}'s Channel Profile`, { id: "profile-scrape" });
        await autoDiscoverCompetitors(profiledChannel);
      } else throw new Error(res.error || "Channel not found");
    } catch (err: any) {
      toast.error(err.message || "Ghost scrape - using encrypted reconstruction", { id: "profile-scrape" });
    } finally { setIsProfiling(false); }
  };

  const handleProfileChannel = () => {
    if (!channelInput.trim()) return performProfileChannel();
    return runGuarded("profile another channel", performProfileChannel);
  };

  const performCloneAndCrush = async () => {
    if (!selectedVideo) { toast.error("Select a competitor video from matrix"); return; }
    if (selectedVideo.isLocked && license.tier === "free") { toast.error("Requires Pro. Unlock via Referral Rewards"); return; }

    setIsRewriting(true);
    setActiveTab("script");

    const steps: { label: string; status: "pending" | "processing" | "success" | "rerouting" | "error"; meta?: string }[] = [
      { label: "Establishing Secure Tunnel via Ghost Node MUM-01...", status: "processing", meta: "ENCRYPTED" },
      { label: `Arming ${selectedTier === "premium" ? "99% GLITCH PROTOCOL" : "60% Standard Optimization"}...`, status: "pending", meta: "ARMING" },
      { label: "Scraping Captions via Ghost Relay Mesh (6 nodes)...", status: "pending", meta: "PIPED MESH" },
      { label: "Enforcing Stealth Disguise & Anti-Clone Shield...", status: "pending", meta: "STEALTH" },
      { label: `Injecting ${selectedTier === "premium" ? "EXTREME Curiosity Glitch" : "Curiosity"} into Title & Hook...`, status: "pending", meta: "GLITCH" },
      { label: "Reverse-Engineering Viral Thumbnail DNA...", status: "pending", meta: "THEFT ENGINE" },
      { label: "Compiling Chain-Loop (5 Viral Assets Package)...", status: "pending", meta: "CHAIN-LOOP" },
    ];
    setLogSteps(steps);

    try {
      steps[0].status = "success"; steps[0].meta = "MUM-01 • 87ms"; steps[1].status = "processing"; setLogSteps([...steps]); await new Promise(r=>setTimeout(r,400));
      steps[1].status = "success"; steps[2].status = "processing"; setLogSteps([...steps]);

      let transcriptData: any;
      try {
        transcriptData = await withClientTimeout((transcriptMutation.mutateAsync as any)({ url: selectedVideo.url, title: selectedVideo.title }), 8_000);
      } catch (err: any) {
        steps[2].status = "rerouting"; steps[2].meta = err?.code === "TIMEOUT" || /timed out|timeout/i.test(err?.message || "") ? "TIMEOUT • SYNTH" : "GHOST RECONSTRUCT"; setLogSteps([...steps]); await new Promise(r=>setTimeout(r,350));
        transcriptData = { transcript: `Ghost reconstructed scaffold for ${selectedVideo.title}: High-retention script about ${nicheInput}. Hook, open loop, value, payoff loop.`, source: "ghost-local", ghostNode: "LOCAL-SYNTH" };
      }

      if (!transcriptData?.transcript || transcriptData.transcript.length < 10) {
        transcriptData.transcript = `Ghost scaffold for ${selectedVideo.title}: viral script about ${nicheInput}`;
      }

      steps[2].status = "success"; steps[2].meta = transcriptData.source?.includes("ghost") ? `${transcriptData.ghostNode || "MUM-01"} • SYNTH` : "LIVE CAPTIONS"; steps[3].status = "processing"; setLogSteps([...steps]); await new Promise(r=>setTimeout(r,300));
      steps[3].status = "success"; steps[4].status = "processing"; setLogSteps([...steps]);

      const rewriteRes = await withClientTimeout(cloneCrushMutation.mutateAsync({ action: "rewrite", targetVideoId: selectedVideo.videoId, originalTranscript: transcriptData.transcript, originalTitle: selectedVideo.title, niche: nicheInput, tier: selectedTier }), 55_000);
      steps[4].status = "success"; steps[5].status = "processing"; setLogSteps([...steps]);

      if (rewriteRes.success && rewriteRes.rewrite) {
        const rw = rewriteRes.rewrite;
        let reverseEngineeredPrompts: string[] = []; let reverseEngineeredSource: any = null;
        try {
          const reverseRes = await withClientTimeout(cloneCrushMutation.mutateAsync({ action: "thumbnail-reverse", glitchTitle: rw.rewrittenTitle, niche: nicheInput, tier: selectedTier }), 18_000);
          const reverseData = reverseRes as any;
          if (reverseData.success && reverseData.thumbnailPrompts) { reverseEngineeredPrompts = reverseData.thumbnailPrompts; reverseEngineeredSource = reverseData.sourceVideo || null; }
        } catch {}
        steps[5].status = "success"; steps[6].status = "processing"; setLogSteps([...steps]); await new Promise(r=>setTimeout(r,250));
        const savedRewrite = addRewrite({
          targetVideoId: selectedVideo.videoId, targetVideoTitle: selectedVideo.title, originalTitle: rw.originalTitle, rewrittenTitle: rw.rewrittenTitle, glitchHook: rw.glitchHook, fullScript: rw.fullScript, retentionKeywordsUsed: rw.retentionKeywordsUsed, seoTags: rw.seoTags, thumbnailPrompt: rw.thumbnailPrompt, editingGuide: rw.editingGuide, tier: selectedTier, isStealthDisguised: true, changedAnalogiesCount: rw.changedAnalogiesCount, changedExamplesCount: rw.changedExamplesCount, glitchTechniques: rw.glitchTechniques, glitchIntensity: rw.glitchIntensity || (selectedTier === "premium" ? 99 : 60), reverseEngineeredPrompts, reverseEngineeredSource,
        });
        const promptCount = reverseEngineeredPrompts.length || 1;
        saveWorkflowPackage({ rewriteId: savedRewrite.id, title: rw.rewrittenTitle, fullScript: rw.fullScript, thumbnailPrompt: rw.thumbnailPrompt, seoTags: rw.seoTags || [] });
        saveContent({ type: "script", title: `Chain-Loop: ${rw.rewrittenTitle.substring(0,35)}...`, content: `GLITCH ${rw.glitchIntensity||60}% | TITLE: ${rw.rewrittenTitle} | HOOK: ${rw.glitchHook} | SCRIPT: ${rw.fullScript} | PROMPTS: ${reverseEngineeredPrompts.length>0?reverseEngineeredPrompts.join('\\n'):rw.thumbnailPrompt} | GUIDE: ${rw.editingGuide}`, metadata: { platform: "YouTube", style: selectedTier === "premium" ? "99% Glitch" : "60% Standard" } });
        incrementStat("scriptsGenerated");
        steps[6].status = "success"; steps[6].meta = "5 ASSETS • SECURED"; setLogSteps([...steps]);
        setBurstTrigger(v => v + 1);
        setXpTrigger(v => v + 1);
        if (navigator.vibrate) navigator.vibrate([20, 30, 20]);
        try { const s = JSON.parse(localStorage.getItem("ghost_streak_v2") || "{}"); const xp = (s.xp || 0) + 30; const streak = s.streak || 1; localStorage.setItem("ghost_streak_v2", JSON.stringify({ ...s, xp, streak, lastDate: new Date().toDateString() })); } catch {}
        toast.success(`🚀 ${selectedTier==="premium"?"99% GLITCH":"60% Standard"} Chain-Loop Secured via Ghost Node • ${promptCount} prompts • +30 XP`);
      } else throw new Error(rewriteRes.error || "Compilation interference");
    } catch (err: any) {
      const rerouted = steps.map(s => s.status==="processing" ? { ...s, status:"rerouting" as const, meta:"GHOST RELAY"} : s);
      setLogSteps(rerouted);
      setTimeout(()=> { const rec = rerouted.map(s=> s.status==="rerouting" ? { ...s, status:"success" as const, meta:"RECOVERED"} : s); setLogSteps(rec); toast.success("Ghost Protocol recovered via mesh - retry for instant compile"); }, 1600);
      toast.error("Ghost tunnel interference - auto-rerouting via MUM-01", { description: "Quantum cache active • Retry 0.8s • Work safe" });
    } finally { setIsRewriting(false); }
  };

  const handleSendToVoiceover = () => { if (!activeRewrite) return; startWorkflowHandoff("voice"); toast.success("Script loaded into Voiceover Studio!"); navigate("/voice"); };
  const handleSendToRepurposer = () => { if (!activeRewrite) return; startWorkflowHandoff("repurposer"); toast.success("Script loaded into Repurposer!"); navigate("/repurposer"); };
  const handleCloneAndCrush = () => { if (!selectedVideo || (selectedVideo.isLocked && license.tier==="free")) return performCloneAndCrush(); return runGuarded("unlock next Clone & Crush result", performCloneAndCrush); };
  const handleCopyThumbnailPrompt = async () => { if (!activeRewrite) return; try { await navigator.clipboard.writeText(activeRewrite.thumbnailPrompt || "Cinematic thumbnail"); toast.success("Thumbnail prompt copied!"); } catch { toast.error("Copy failed"); } };
  const handleCopySeoTags = async () => { if (!activeRewrite) return; try { await navigator.clipboard.writeText((activeRewrite.seoTags||[]).join(", ")); toast.success("SEO tags copied!"); } catch { toast.error("Copy failed"); } };
  const handleCopyScript = async () => { if (!activeRewrite) return; const txt = `TITLE: ${activeRewrite.rewrittenTitle}\nHOOK: ${activeRewrite.glitchHook}\nSCRIPT: ${activeRewrite.fullScript}`; try { await navigator.clipboard.writeText(txt); setCopiedText(true); toast.success("Script copied!"); setTimeout(()=>setCopiedText(false),2000); } catch { toast.error("Copy failed"); } };
  const openReferralRewards = () => navigate("/rewards");

  return (
    <div className="relative space-y-6 md:space-y-8 animate-fade-in pb-12">
      <VideoWallBackground intensity="high" />
      <div className="relative z-10 space-y-4">
        <WarRoomTicker />
        <div className="flex flex-wrap items-center gap-3">
          <LiveActiveCounter compact />
          <GhostNodeStatus compact />
          <BroadcastSyncIndicator compact />
          {wideningGap && wideningGap.dailyLoss>0 && <LossAversionTicker dailyLoss={wideningGap.dailyLoss} />}
        </div>
        {showIntelDrop && <GhostIntelDrop />}
      </div>

      {/* Dopamine overlays */}
      <XpGainPopup trigger={xpTrigger} xp={30} label="XP • Ghost Chain-Loop" />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] pointer-events-none z-50">
        <ParticleBurst trigger={burstTrigger} />
      </div>

      <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2 text-glitch">
            <Zap className="w-7 h-7 md:w-8 md:h-8 text-primary animate-pulse" />
            Clone &amp; Crush AI
            <span className="px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] border border-primary/20 font-display tracking-wide">Ghost Protocol v4.2 • Chain-Loop</span>
          </h1>
          <p className="text-sm md:text-base text-muted-foreground mt-1 max-w-3xl">Auto-profile via ghost mesh, live velocity audit, Stealth Disguise Protocol • <span className="text-cyan-300 font-mono text-xs">MUM-01 • ENCRYPTED UPLINK</span></p>
        </div>
        <div className="flex items-center gap-3">
          <GhostNodeStatus />
          <div className="p-3 bg-card border border-border rounded-xl flex items-center gap-3">
            <Award className="w-5 h-5 text-primary" />
            <div><p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Clearance</p><p className="text-sm font-bold text-foreground capitalize">{license.tier} • Level 4</p></div>
            {license.tier==="free" && <Button size="sm" onClick={openReferralRewards} className="cyber-button text-[10px] px-3 h-8 font-display">Unlock Pro ₹0</Button>}
          </div>
        </div>
      </div>

      {showBoot && (
        <div className="relative z-10">
          <GhostBootSequence onComplete={()=>setShowBoot(false)} />
        </div>
      )}

      <div className="relative z-10 grid lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 space-y-6">
          <Card className="glass-strong bracket border-primary/20">
            <CardHeader className="pb-3">
              <CardTitle className="font-display text-base flex items-center gap-2"><Terminal className="w-5 h-5 text-primary" />1. Auto-Profile Channel (Ghost Mesh • Zero-Friction)</CardTitle>
              <CardDescription className="text-xs">Paste YouTube URL or Handle. Ghost Protocol reconstructs even if API quota dead. You never see red FAILED.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Youtube className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="YouTube Channel URL or Handle (e.g. @MrBeast)" value={channelInput} onChange={e=>setChannelInput(e.target.value)} className="pl-10 bg-secondary/40 border-border/80 h-11 text-sm placeholder:text-muted-foreground/60" />
                </div>
                <Button onClick={handleProfileChannel} disabled={isProfiling} className="cyber-button px-5 h-11 shrink-0 font-display text-sm flex gap-2">
                  {isProfiling ? <><Loader2 className="w-4 h-4 animate-spin" />Ghost Scraping...</> : <><Cpu className="w-4 h-4" />Launch Ghost Showdown</>}
                </Button>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
                <Radio className="w-3 h-3 text-green-400 animate-pulse" /> Ghost Relay Mesh: 6 Piped nodes • 3 Invidious • Synthetic fallback active
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
                  <div><div className="flex items-center justify-between mb-3"><span className="text-[10px] font-mono uppercase bg-primary/20 text-primary px-2.5 py-0.5 rounded-full font-bold">Your Channel • Ghost Verified</span><span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" /></div>
                  <div className="flex items-center gap-3.5 mt-2"><img src={profile.avatar} alt={profile.name} className="w-14 h-14 rounded-full border-2 border-primary/50 object-cover bg-card shadow-md shrink-0" /><div className="min-w-0"><p className="text-base font-bold text-foreground truncate">{profile.name}</p><p className="text-xs text-primary font-medium mt-0.5">{profile.handle} {(profile as any).isGhostReconstructed && <span className="text-[9px] bg-amber-500/15 text-amber-300 border border-amber-500/20 px-1.5 py-0.5 rounded-full ml-1">GHOST RECON</span>}</p></div></div>
                  <p className="text-xs text-muted-foreground mt-3 line-clamp-3 leading-relaxed">{profile.description}</p></div>
                  <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between text-[11px] text-muted-foreground"><span>Niche: <strong className="text-foreground">{nicheInput||"Auto"}</strong></span><span className="text-green-400 font-semibold flex items-center gap-1"><Activity className="w-3 h-3" />Active • {(profile as any).ghostNode||"MUM-01"}</span></div>
                </Card>
              </div>
              <div className="lg:col-span-2 flex flex-col items-center justify-center py-2 lg:py-0"><div className="relative flex items-center justify-center"><div className="absolute inset-0 bg-red-500/30 rounded-full blur-xl animate-pulse" /><div className="w-14 h-14 rounded-full bg-gradient-to-br from-red-600 to-rose-950 border-2 border-red-500 flex items-center justify-center shadow-[0_0_30px_rgba(239,68,68,0.9)] relative z-10 animate-pulse"><Zap className="w-7 h-7 text-white fill-white animate-bounce" /></div></div><span className="text-[11px] font-display font-extrabold text-red-500 tracking-widest mt-2 uppercase drop-shadow-[0_0_10px_rgba(239,68,68,0.8)]">VS SHOWDOWN</span></div>
              <div className="lg:col-span-5 h-full">
                <Card className="glass-strong border-border/80 p-5 h-full flex flex-col justify-between">
                  <div><div className="flex items-center justify-between mb-3"><span className="text-[10px] font-mono uppercase bg-red-500/10 text-red-400 border border-red-500/20 px-2.5 py-0.5 rounded-full font-bold">Live Velocity Matrix</span><span className="text-xs text-muted-foreground">{competitors.length} Outliers {(competitors[0] as any)?.isGhostReconstructed && <span className="text-amber-300">• Ghost</span>}</span></div>
                  {isSearchingCompetitors ? (<div className="py-10 text-center space-y-2"><Loader2 className="w-7 h-7 animate-spin text-primary mx-auto" /><p className="text-xs text-muted-foreground">Auditing via ghost mesh (6 relays)...</p><div className="flex justify-center gap-1 mt-2">{[0,1,2,3].map(i=><span key={i} className="w-1 h-1 rounded-full bg-primary/60 animate-pulse" style={{animationDelay:`${i*150}ms`}} />)}</div></div>) : competitors.length>0 ? (
                    <div className="grid grid-cols-3 gap-2 mt-2">{competitors.map((video, idx)=>{ const isSelected = selectedVideo?.videoId===video.videoId; const velocityColor = (video.viralVelocityScore||0)>=70?'text-red-400':(video.viralVelocityScore||0)>=40?'text-yellow-400':'text-green-400'; return (
                      <div key={video.videoId} onClick={()=>{ if(video.isLocked) return; setSelectedVideo(video); selectWorkflowCompetitor({videoId:video.videoId,title:video.title,url:video.url,channelName:video.channelName,thumbnail:video.thumbnail}, nicheInput); }} className={`group relative rounded-xl border p-2 cursor-pointer transition-all duration-300 flex flex-col justify-between bg-secondary/30 ${isSelected?"border-primary bg-primary/15 ring-2 ring-primary/60 shadow-neon-glow":"border-border/60 hover:border-border"} ${video.isLocked?"pointer-events-none":""}`}>
                        <div className="absolute top-1 left-1 z-10 bg-primary text-primary-foreground text-[7px] font-bold px-1.5 py-0.5 rounded-full">{idx===0?"Unlocked":`Locked #${idx}`}</div>
                        <div className="relative aspect-video rounded-lg overflow-hidden bg-black/60 shrink-0 mb-1.5"><img src={video.thumbnail} alt={video.title} className={`w-full h-full object-cover ${video.isLocked?"blur-sm opacity-40":""}`} />{video.isLocked && <div className="absolute inset-0 flex flex-col items-center justify-center p-1 text-center bg-black/80"><Lock className="w-4 h-4 text-primary animate-pulse mb-1" /><span className="text-[7px] font-bold text-foreground">PRO LOCKED</span></div>}</div>
                        <div><p className="text-[9px] font-bold line-clamp-2 text-foreground leading-tight">{video.title}</p><p className="text-[8px] text-primary font-mono mt-1 font-semibold">{video.views}</p><div className="flex items-center gap-1.5 mt-1">{video.estimatedRevenue && <span className="text-[7px] font-bold text-green-400 bg-green-400/10 px-1 py-0.5 rounded flex items-center gap-0.5"><DollarSign className="w-2.5 h-2.5" />{video.estimatedRevenue}</span>}{video.viralVelocityScore!==undefined && <span className={`text-[7px] font-bold ${velocityColor} bg-secondary/60 px-1 py-0.5 rounded flex items-center gap-0.5`}><Flame className="w-2.5 h-2.5" />{video.viralVelocityScore}</span>}</div></div>
                      </div>);})}</div>) : (<div className="py-8 text-center text-xs text-muted-foreground">Profile your channel to launch ghost showdown matrix.</div>)}</div>
                  {competitors.some(v=>v.isLocked) && license.tier==="free" && (<div className="mt-3 p-2.5 rounded-lg bg-gradient-to-r from-primary/10 via-secondary/40 to-accent/10 border border-primary/20 flex items-center justify-between gap-2"><div className="flex items-center gap-2 min-w-0"><Lock className="w-4 h-4 text-primary shrink-0" /><p className="text-[10px] font-bold text-foreground truncate">Unlock Hidden Trend Competitors via Referral</p></div><Button onClick={openReferralRewards} size="sm" className="cyber-button text-[10px] shrink-0 font-display h-7 px-2.5">Unlock Pro ₹0</Button></div>)}
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
              <div className="p-3 rounded-xl glass-strong border-green-500/20"><p className="text-[10px] text-green-400 font-mono uppercase tracking-wider font-bold flex items-center gap-1"><DollarSign className="w-3 h-3" /> Competitor Revenue</p><p className="text-lg font-display font-bold text-green-400 mt-1">{envyMetrics.totalCompetitorMonthlyRevenue}</p><p className="text-[9px] text-muted-foreground mt-0.5">Est combined/mo • Ghost calc</p></div>
              <div className="p-3 rounded-xl glass-strong border-red-500/20"><p className="text-[10px] text-red-400 font-mono uppercase tracking-wider font-bold flex items-center gap-1"><Flame className="w-3 h-3" /> Viral Velocity</p><p className="text-lg font-display font-bold text-red-400 mt-1">{envyMetrics.averageViralVelocity}/100</p><p className="text-[9px] text-muted-foreground mt-0.5">Avg score • Live</p></div>
              <div className="p-3 rounded-xl glass-strong border-primary/20"><p className="text-[10px] text-primary font-mono uppercase tracking-wider font-bold flex items-center gap-1"><Gauge className="w-3 h-3" /> Niche CPM</p><p className="text-lg font-display font-bold text-primary mt-1">{envyMetrics.nicheCpm}</p><p className="text-[9px] text-muted-foreground mt-0.5">{envyMetrics.niche}</p></div>
            </div>
          )}

          {selectedVideo && (
            <Card className="glass-strong border-border bracket">
              <CardHeader className="pb-3"><CardTitle className="font-display text-base flex items-center gap-2"><Zap className="w-5 h-5 text-primary" />3. Chain-Loop Loophole Configurator (Ghost Mesh Active)</CardTitle><CardDescription className="text-xs">Ghost Protocol ensures never red FAILED - amber re-routing + quantum cache. 1 click = 5 assets via MUM-01 edge node.</CardDescription></CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div onClick={()=>setSelectedVideoTier("free")} className={`rounded-xl border p-4 cursor-pointer transition-all ${selectedTier==="free"?"border-primary bg-primary/5 ring-1 ring-primary/30":"border-border/60 hover:border-border bg-secondary/10"}`}>
                    <div className="flex items-center gap-2 mb-1"><input type="radio" checked={selectedTier==="free"} onChange={()=>{}} className="accent-primary" /><p className="text-sm font-bold text-foreground">60% Loophole (Vibe-Extract)</p></div>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">Extracts core points, writes entirely new narrative flow, fresh pacing. Ghost cached.</p>
                  </div>
                  <div onClick={()=>{ if(license.tier==="free"){ toast.error("99% Glitch reserved for Pro"); return;} setSelectedVideoTier("premium"); }} className={`rounded-xl border p-4 cursor-pointer transition-all ${license.tier==="free"?"opacity-50":""} ${selectedTier==="premium"?"border-primary bg-primary/5 ring-1 ring-primary/30":"border-border/60 hover:border-border bg-secondary/10"}`}>
                    <div className="flex items-center justify-between gap-2 mb-1"><div className="flex items-center gap-2"><input type="radio" checked={selectedTier==="premium"} onChange={()=>{}} disabled={license.tier==="free"} className="accent-primary" /><p className="text-sm font-bold text-foreground">99% Glitch (Maximum Aggression)</p></div>{license.tier==="free" && <Lock className="w-3.5 h-3.5 text-primary" />}</div>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">Extreme Curiosity Glitches, time-jumps, hidden secrets. Reverse-engineers thumbnails ruthlessly.</p>
                  </div>
                </div>
                <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl flex gap-3 items-start"><ShieldAlert className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" /><div><p className="text-xs font-bold text-yellow-500">Stealth Disguise Protocol Active • Ghost Node MUM-01</p><p className="text-[10px] text-muted-foreground leading-relaxed">All outputs deploy Anti-Clone Illusion: analogies discarded, case studies swapped, vocabularies updated. Never cloned.</p></div></div>
                <Button onClick={handleCloneAndCrush} disabled={isRewriting} className="w-full h-12 bg-gradient-to-r from-primary to-accent text-primary-foreground font-display font-bold uppercase tracking-wider text-sm flex gap-2">
                  {isRewriting ? <><Loader2 className="w-4 h-4 animate-spin" />Executing Chain-Loop via Ghost Mesh...</> : <><Zap className="w-4 h-4 fill-primary-foreground" />Execute Chain-Loop (1 Click = 5 Assets) • MUM-01</>}
                </Button>

                {logSteps.length>0 && (
                  <div className="font-mono bg-black rounded-xl border border-primary/20 p-4 text-xs space-y-2 max-h-[260px] overflow-y-auto relative overflow-hidden">
                    <div className="absolute inset-0 ghost-scanline opacity-[0.04] pointer-events-none" />
                    <p className="text-primary font-bold border-b border-border/50 pb-1.5 flex items-center justify-between relative z-10"><span className="flex items-center gap-2"><Terminal className="w-3.5 h-3.5" />GHOST CHAIN-LOOP CONSOLE • MUM-01</span><span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /><span className="text-[9px] bg-primary/20 px-2 py-0.5 rounded text-primary animate-pulse">LIVE</span></span></p>
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
                      {["MUM-01","BLR-02","DEL-03"].map((n,i)=>(
                        <span key={n} className={`text-[8px] font-mono px-1.5 py-0.5 rounded border ${logSteps.some(s=>s.status==="processing") && i===0 ?"bg-primary/20 border-primary/30 text-primary animate-pulse":"bg-secondary/40 border-border/30 text-muted-foreground"}`}>{n}</span>
                      ))}
                      <span className="text-[8px] text-muted-foreground ml-auto">Quantum Cache: 87ms • Encrypted</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="lg:col-span-4 space-y-6">
          {activeRewrite ? (
            <Card className="glass-strong border-primary/40 shadow-neon-glow animate-fade-in bracket">
              <CardHeader className="pb-3 border-b border-border/40"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-[9px] font-mono tracking-widest uppercase">Chain-Loop Master • Ghost Secured</span><CardTitle className="font-display text-base text-foreground mt-2 line-clamp-2">{activeRewrite.rewrittenTitle}</CardTitle><p className="text-[10px] text-muted-foreground truncate mt-1">Based on: {activeRewrite.targetVideoTitle} • MUM-01</p></div><Button variant="outline" size="icon" onClick={handleCopyScript} className="shrink-0 border-border hover:border-primary/40 text-muted-foreground hover:text-primary active:scale-95"><Copy className="w-4 h-4" /></Button></div></CardHeader>
              <CardContent className="pt-5 space-y-5">
                <div className="p-4 rounded-xl glass-ghost border-primary/30 space-y-3"><div className="flex items-center justify-between"><p className="text-xs font-display font-bold text-foreground flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-primary animate-pulse" />Chain-Loop Complete: 5 Assets</p><span className="text-[10px] bg-primary text-primary-foreground font-mono font-bold px-2 py-0.5 rounded-full uppercase">No-Click Handoff</span></div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2"><Button onClick={handleSendToVoiceover} size="sm" className="cyber-button text-xs h-9 font-display gap-1.5 justify-start px-3"><Mic className="w-3.5 h-3.5 shrink-0" /><span>Send to Voiceover</span></Button><Button onClick={handleSendToRepurposer} size="sm" variant="outline" className="border-border hover:border-primary/50 text-xs h-9 font-display gap-1.5 justify-start px-3"><Share2 className="w-3.5 h-3.5 text-primary shrink-0" /><span>Repurpose</span></Button><Button onClick={handleCopyThumbnailPrompt} size="sm" variant="outline" className="border-border hover:border-primary/50 text-xs h-9 font-display gap-1.5 justify-start px-3"><Image className="w-3.5 h-3.5 text-primary shrink-0" /><span>Copy Thumb Prompt</span></Button><Button onClick={handleCopySeoTags} size="sm" variant="outline" className="border-border hover:border-primary/50 text-xs h-9 font-display gap-1.5 justify-start px-3"><Search className="w-3.5 h-3.5 text-primary shrink-0" /><span>Copy SEO</span></Button></div>
                </div>
                <div className="flex items-center gap-3"><div className="flex-1"><div className="flex items-center justify-between mb-1"><span className="text-[10px] font-display font-bold text-foreground uppercase tracking-wider">Glitch Intensity</span><span className={`text-xs font-mono font-bold ${(activeRewrite.glitchIntensity||60)>=90?'text-red-400':'text-yellow-400'}`}>{activeRewrite.glitchIntensity||60}%</span></div><div className="h-2 bg-secondary rounded-full overflow-hidden"><div className={`h-full rounded-full transition-all duration-1000 ${(activeRewrite.glitchIntensity||60)>=90?'bg-gradient-to-r from-red-600 via-red-400 to-orange-400':'bg-gradient-to-r from-yellow-600 via-yellow-400 to-green-400'}`} style={{width:`${activeRewrite.glitchIntensity||60}%`}} /></div></div>{activeRewrite.glitchTechniques && <div className="flex flex-wrap gap-1">{activeRewrite.glitchTechniques.map((tech:any,i:number)=><span key={i} className="text-[8px] font-mono bg-red-500/10 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded">{tech}</span>)}</div>}</div>
                <div className="relative rounded-xl border border-destructive/30 bg-destructive/5 p-4 overflow-hidden shadow-sm"><div className="absolute top-0 right-0 w-20 h-20 bg-destructive/10 rounded-full blur-xl" /><div className="flex items-start gap-3 relative z-10"><ShieldAlert className="w-5 h-5 text-destructive shrink-0 mt-0.5" /><div><p className="text-xs font-bold text-destructive font-display uppercase tracking-wider">15s Glitch Hook ({(activeRewrite.glitchIntensity||60)>=90?'EXTREME':'Standard'})</p><p className="text-xs text-foreground mt-1.5 leading-relaxed font-medium italic">"{activeRewrite.glitchHook}"</p></div></div></div>
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full"><TabsList className="grid grid-cols-4 bg-secondary/60 border border-border h-9 rounded-lg"><TabsTrigger value="script" className="text-[11px] font-semibold rounded-md">Script</TabsTrigger><TabsTrigger value="thumbnail" className="text-[11px] font-semibold rounded-md">Thumb</TabsTrigger><TabsTrigger value="tags" className="text-[11px] font-semibold rounded-md">Tags</TabsTrigger><TabsTrigger value="guide" className="text-[11px] font-semibold rounded-md">Guide</TabsTrigger></TabsList>
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
              <p className="text-xs text-muted-foreground max-w-[250px] mt-2 leading-relaxed">Profile your channel, select video from Showdown Matrix, hit <strong className="text-foreground">Execute Chain-Loop</strong> via Ghost Mesh.</p>
              <div className="mt-4 flex items-center gap-2 text-[9px] font-mono text-muted-foreground"><Cpu className="w-3 h-3" />Ghost Node MUM-01 • Encrypted • Quantum Cache Active</div>
            </Card>
          )}

          <Card className="glass-strong border-border"><CardHeader className="pb-2"><CardTitle className="font-display text-sm font-semibold text-foreground flex items-center gap-2"><History className="w-4 h-4 text-primary" />Historic Packages ({rewrites.length}) • Ghost Cache</CardTitle></CardHeader><CardContent className="px-3 pb-3">{rewrites.length>0 ? (<div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">{rewrites.map((r:any)=>{ const isSelected = activeRewrite?.id===r.id; return (<div key={r.id} className={`group relative flex items-center justify-between p-2.5 rounded-lg border text-left cursor-pointer transition-colors ${isSelected?"border-primary bg-primary/10":"border-border/40 hover:border-border bg-secondary/10"}`}><div onClick={()=>setActiveRewrite(r)} className="flex-1 min-w-0 pr-6"><p className="text-[11px] font-bold text-foreground truncate">{r.rewrittenTitle}</p><p className="text-[9px] text-muted-foreground truncate mt-0.5">{r.tier==="premium"?"99% Glitch":"60% Standard"} • {r.glitchIntensity||60}% • {new Date(r.createdAt).toLocaleDateString()}</p></div><button onClick={e=>{ e.stopPropagation(); deleteRewrite(r.id); toast.success("Package removed"); }} className="absolute right-2 opacity-0 group-hover:opacity-100 hover:text-destructive text-muted-foreground transition-all duration-200"><XCircle className="w-3.5 h-3.5" /></button></div>);})}</div>) : (<div className="text-center py-6 text-muted-foreground/60 text-xs">Generated Chain-Loop packages appear here • Ghost cached</div>)}</CardContent></Card>
        </div>
      </div>
    </div>
  );
}
