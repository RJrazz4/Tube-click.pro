import { lazy, memo, Suspense, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Bot,
  Image,
  Eye,
  Mic,
  FileText,
  Download,
  Trash2,
  ArrowUpRight,
  Loader2,
  X,
  Sparkles,
  RefreshCw,
  Share2,
  TrendingUp,
  Search,
  Zap,
  DollarSign,
  Flame,
  Gauge,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useContentStats, useContentActions } from "@/hooks/useContentStats";
import type { SavedContent } from "@/stores/useContentStore";
import { VerificationModal } from "@/components/VerificationModal";
import { DeferredModule } from "@/components/performance/DeferredModule";
import { WorkflowContinueCard } from "@/components/workflow/WorkflowContinueCard";
import { useCloneCrushStore } from "@/stores/useCloneCrushStore";

const ViralGrowthPass = lazy(() =>
  import("@/components/referrals/ViralGrowthPass").then((module) => ({ default: module.ViralGrowthPass })),
);

const CompetitorShowdown = lazy(() =>
  import("@/components/showdown/CompetitorShowdown").then((module) => ({ default: module.CompetitorShowdown })),
);

// The Lab is intentionally deferred: it is below the primary creator workflow
// and should not compete with mobile FCP or first interaction.
const TheLab = lazy(() =>
  import("@/components/lab/TheLab").then((module) => ({ default: module.TheLab })),
);

const tools = [
  {
    title: "Clone & Crush AI",
    description: "Ethically clone competitor viral scripts with Stealth Disguise",
    icon: Zap,
    path: "/clone-crush",
    gradient: "from-purple-600 via-indigo-600 to-cyan-500",
    glow: "neon-glow-purple",
  },
  {
    title: "TubeBot AI Agent",
    description: "Generate viral titles, hooks & scripts",
    icon: Bot,
    path: "/chat-agent",
    gradient: "from-neon-purple to-pink-500",
    glow: "neon-glow-purple",
  },
  {
    title: "Voiceover Studio",
    description: "Cinematic AI voiceovers with Neural Engine",
    icon: Mic,
    path: "/voice",
    gradient: "from-orange-400 to-red-500",
    glow: "",
  },
  {
    title: "Multi-Platform Repurposer",
    description: "Convert scripts to X, IG, LinkedIn & YouTube",
    icon: Share2,
    path: "/repurposer",
    gradient: "from-pink-500 to-rose-600",
    glow: "",
  },
  {
    title: "Channel Analytics & ROI",
    description: "Simulate growth, AdSense & brand deals",
    icon: TrendingUp,
    path: "/analytics",
    gradient: "from-blue-500 to-indigo-600",
    glow: "",
  },
  {
    title: "SEO Tag & Competitor AI",
    description: "High-CTR tags & search volume audit",
    icon: Search,
    path: "/seo",
    gradient: "from-emerald-500 to-teal-600",
    glow: "",
  },
];

// Memoized stat card — prevents re-render when other stats change
const StatCard = memo(function StatCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: any; color: string }) {
  return (
    <Card className="cyber-card border-border hover:border-primary/30 transition-colors">
      <CardContent className="p-3 md:p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs md:text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl md:text-3xl font-display font-bold text-foreground mt-1">{value}</p>
          </div>
          <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className={`w-4 h-4 md:w-5 md:h-5 ${color}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

// Memoized tool card for instant hover feel
const ToolCard = memo(function ToolCard({ tool, index }: { tool: typeof tools[0]; index: number }) {
  return (
    <Link to={tool.path} className="group touch-manipulation" style={{ animationDelay: `${index * 100}ms` }}>
      <div
        className={cn(
          "relative rounded-2xl border backdrop-blur-md bg-card/80 shadow-lg",
          "border-border/50 transition-all duration-300",
          "hover:shadow-xl hover:border-primary/50 hover:scale-[1.02]",
          "active:scale-[0.98]",
          tool.glow
        )}
      >
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/5 to-accent/5 pointer-events-none" />
        <div className="relative p-5 md:p-6 flex items-center gap-4">
          <div className={`w-14 h-14 md:w-16 md:h-16 rounded-xl bg-gradient-to-br ${tool.gradient} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform shadow-lg`}>
            <tool.icon className="w-7 h-7 md:w-8 md:h-8 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-display font-semibold text-base md:text-lg text-foreground group-hover:text-primary transition-colors">
                {tool.title}
              </h3>
              <ArrowUpRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </div>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{tool.description}</p>
          </div>
        </div>
      </div>
    </Link>
  );
});

export default function Dashboard() {
  // Phase A2: Zustand selectors — NO polling, reactive subscription, memoized via selectors
  const { stats, recentContent, totalContent } = useContentStats();
  const { deleteContent, clearAll } = useContentActions();
  const profile = useCloneCrushStore((s) => s.profile);
  const competitors = useCloneCrushStore((s) => s.competitors);
  const envyMetrics = useCloneCrushStore((s) => s.envyMetrics);
  const threatAlerts = useCloneCrushStore((s) => s.threatAlerts);
  const wideningGap = useCloneCrushStore((s) => s.wideningGap);

  const [isExporting, setIsExporting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [verificationOpen, setVerificationOpen] = useState(false);

  const doExport = useCallback(async () => {
    setIsExporting(true);
    try {
      // JSZip is a substantial dependency. Load it only after the user requests
      // an export so mobile startup does not pay for an infrequent action.
      const { exportAllAsZip } = await import("@/lib/export");
      await exportAllAsZip();
      toast.success("All content exported as ZIP!");
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to export content";
      toast.error(msg);
    } finally {
      setIsExporting(false);
    }
  }, []);

  const handleExportAll = useCallback(() => {
    if (totalContent === 0) {
      toast.error("No content to export. Create some content first!");
      return;
    }
    setVerificationOpen(true);
  }, [totalContent]);

  const handleClearAll = useCallback(() => {
    if (totalContent === 0) {
      toast.info("No content to clear");
      return;
    }
    if (confirm("Are you sure you want to delete all saved content? This cannot be undone.")) {
      setIsClearing(true);
      try {
        clearAll();
        toast.success("All content cleared!");
      } catch {
        toast.error("Failed to clear content");
      } finally {
        setIsClearing(false);
      }
    }
  }, [totalContent, clearAll]);

  const handleDeleteItem = useCallback(
    (id: string) => {
      deleteContent(id);
      toast.success("Item removed");
    },
    [deleteContent]
  );

  const getContentIcon = useCallback((type: SavedContent["type"]) => {
    switch (type) {
      case "script":
        return FileText;
      case "thumbnail":
        return Image;
      case "voiceover":
        return Mic;
      case "guide":
        return Eye;
      default:
        return FileText;
    }
  }, []);

  const statDefs = [
    { key: "scripts", label: "Scripts Generated", value: stats.scriptsGenerated, icon: FileText, color: "text-primary" },
    { key: "thumbs", label: "Thumbnail Prompts", value: stats.thumbnailsCreated, icon: Image, color: "text-accent" },
    { key: "voice", label: "Voiceovers Made", value: stats.voiceoversGenerated, icon: Mic, color: "text-orange-400" },
    { key: "guides", label: "Guides Created", value: stats.guidesCreated, icon: Eye, color: "text-green-400" },
  ];

  return (
    <div className="space-y-6 md:space-y-8 animate-fade-in">
      <VerificationModal open={verificationOpen} onOpenChange={setVerificationOpen} onVerified={doExport} />

      {/* Welcome Section — eager load, no lazy */}
      {profile ? (
        <div 
          className="relative overflow-hidden rounded-2xl border border-border bg-cover bg-center min-h-[160px] md:min-h-[200px]"
          style={{ 
            backgroundImage: profile.banner && profile.banner !== 'PLACEHOLDER_GRADIENT' 
              ? `linear-gradient(to right, rgba(10, 10, 12, 0.95) 40%, rgba(10, 10, 12, 0.4)), url(${profile.banner})`
              : `linear-gradient(135deg, rgba(88, 28, 135, 0.2) 0%, rgba(9, 9, 11, 0.9) 70%)`
          }}
        >
          {/* Cyberpunk grid overlay on placeholder gradient */}
          {(!profile.banner || profile.banner === 'PLACEHOLDER_GRADIENT') && (
            <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:20px_20px]" />
          )}

          <div className="relative z-10 p-5 md:p-8 flex flex-col md:flex-row items-start md:items-center gap-5 h-full">
            <div className="relative group shrink-0">
              <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-neon-purple to-neon-cyan opacity-75 blur-sm animate-pulse" />
              <img 
                src={profile.avatar} 
                alt={profile.name} 
                className="relative w-16 h-16 md:w-20 md:h-20 rounded-full border-2 border-background object-cover bg-card"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=60";
                }}
              />
            </div>

            <div className="space-y-1.5 md:space-y-2 flex-1 min-w-0">
              <div className="flex items-center flex-wrap gap-2">
                <h1 className="font-display text-xl md:text-2xl lg:text-3xl font-bold text-foreground truncate">
                  {profile.name}
                </h1>
                <span className="px-2.5 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30 font-display text-[10px] uppercase tracking-wider font-semibold">
                  Profiled Creator
                </span>
                {envyMetrics && (
                  <span className="px-2.5 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 font-display text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1">
                    <Flame className="w-3 h-3" />
                    {competitors.length} Competitors Tracked
                  </span>
                )}
              </div>
              <p className="text-xs md:text-sm text-primary font-medium tracking-wide">
                {profile.handle} {profile.subscriberCountText && profile.subscriberCountText !== 'N/A' && `• ${profile.subscriberCountText} subscribers`}
              </p>
              <p className="text-xs md:text-sm text-muted-foreground max-w-2xl line-clamp-2 md:line-clamp-3 leading-relaxed">
                {profile.description}
              </p>
              <p className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                Live Matrix active • Profiled on {new Date(profile.profiledAt).toLocaleDateString()}
              </p>
            </div>
            
            <div className="self-end md:self-center shrink-0">
              <Link to="/clone-crush">
                <Button size="sm" className="cyber-button text-xs gap-1.5 font-display">
                  <Zap className="w-3.5 h-3.5 text-primary-foreground fill-primary-foreground" />
                  Clone &amp; Crush Hub
                </Button>
              </Link>
            </div>
          </div>
          <div className="absolute -right-10 -top-10 w-40 h-40 bg-primary/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -right-20 -bottom-10 w-60 h-60 bg-accent/10 rounded-full blur-3xl pointer-events-none" />
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-primary/20 via-card to-accent/20 p-5 md:p-8 border border-border gradient-border">
          <div className="relative z-10">
            <h1 className="font-display text-2xl md:text-3xl lg:text-4xl font-black mb-2 md:mb-3 bg-gradient-to-r from-red-400 via-orange-400 to-yellow-400 text-transparent bg-clip-text drop-shadow-[0_0_15px_rgba(239,68,68,0.4)]">
              Your Competitors Are Growing. <span className="text-red-400 animate-pulse">Are You?</span>
            </h1>
            <p className="text-base md:text-lg text-muted-foreground max-w-xl leading-relaxed">
              Paste your YouTube URL below to unlock the <span className="text-red-400 font-semibold">Competitive Intelligence War Room</span> — see exactly who's stealing your audience, how much they're earning, and clone their winning formula in 1 click.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <Link to="/clone-crush">
                <Button size="sm" className="cyber-button text-xs gap-1.5 font-display">
                  <Zap className="w-3.5 h-3.5 text-primary-foreground fill-primary-foreground" />
                  Launch Clone &amp; Crush
                </Button>
              </Link>
              <span className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                Real-time competitor analysis
              </span>
            </div>
            {totalContent > 0 && (
              <div className="mt-4 flex gap-3">
                <Button variant="outline" size="sm" onClick={handleClearAll} disabled={isExporting || isClearing} className="border-destructive/40 text-destructive hover:bg-destructive/10 h-10 px-4 text-sm">
                  {isClearing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                  Clear All ({totalContent})
                </Button>
              </div>
            )}
          </div>
          <div className="absolute -right-10 -top-10 w-40 h-40 bg-primary/30 rounded-full blur-3xl" />
          <div className="absolute -right-20 -bottom-10 w-60 h-60 bg-accent/20 rounded-full blur-3xl" />
        </div>
      )}

      <WorkflowContinueCard />

      <Suspense fallback={<div className="h-28 animate-pulse rounded-2xl border border-border bg-card/60" />}>
        <ViralGrowthPass />
      </Suspense>

      {/* Competitive intelligence views */}
      {competitors.length > 0 && (
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="grid h-auto w-full max-w-md grid-cols-2 border border-border/60 bg-card/70 p-1">
            <TabsTrigger value="overview" className="gap-2 py-2">
              <TrendingUp className="h-4 w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="showdown" className="gap-2 py-2">
              <Gauge className="h-4 w-4" />
              Showdown Analytics
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-0">
            {/* THE WAR ROOM — Envy Engine Dashboard */}
            {profile && envyMetrics && (
              <div className="space-y-4 animate-fade-in">
          <h2 className="font-display text-lg md:text-xl font-semibold text-foreground flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-400 animate-pulse" />
            <span className="bg-gradient-to-r from-red-400 to-orange-400 text-transparent bg-clip-text">
              Competitive Intelligence — The War Room
            </span>
          </h2>
          
          {/* Live Threat Alerts */}
          {threatAlerts.length > 0 && (
            <div className="space-y-2">
              {threatAlerts.slice(0, 2).map((alert, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-xl border flex items-center gap-3 ${
                    alert.type === 'critical'
                      ? 'bg-red-500/10 border-red-500/30'
                      : alert.type === 'warning'
                      ? 'bg-yellow-500/10 border-yellow-500/20'
                      : 'bg-blue-500/10 border-blue-500/20'
                  }`}
                >
                  <span className="text-lg shrink-0">{alert.icon}</span>
                  <p className={`text-xs font-bold flex-1 ${
                    alert.type === 'critical' ? 'text-red-400' : alert.type === 'warning' ? 'text-yellow-400' : 'text-blue-400'
                  }`}>
                    {alert.message}
                  </p>
                </div>
              ))}
              {wideningGap && wideningGap.dailyLoss > 0 && (
                <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/15 flex items-center gap-3">
                  <TrendingUp className="w-4 h-4 text-red-400 shrink-0" />
                  <p className="text-[10px] font-bold text-red-400 flex-1">
                    📉 Widening Gap: ~${wideningGap.dailyLoss.toLocaleString()}/day — ${wideningGap.monthlyLoss.toLocaleString()}/month slipping away
                  </p>
                  <Link to="/clone-crush">
                    <Button size="sm" className="cyber-button text-[9px] h-7 px-2 font-display">Crush Now</Button>
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* Revenue Gap Banner */}
          <div className="p-4 md:p-5 rounded-2xl bg-gradient-to-r from-red-500/10 via-card to-green-500/10 border border-red-500/20 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 rounded-full blur-2xl pointer-events-none" />
            <div className="relative z-10">
              <p className="text-[10px] text-red-400 font-mono uppercase tracking-widest font-bold mb-2">
                🔴 Revenue Gap Analysis — Your Niche: {envyMetrics.niche}
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Competitors Earn (est.)</p>
                  <p className="text-xl md:text-2xl font-display font-bold text-green-400 mt-0.5">
                    {envyMetrics.totalCompetitorMonthlyRevenue}<span className="text-xs text-muted-foreground">/mo</span>
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Your Subscribers</p>
                  <p className="text-xl md:text-2xl font-display font-bold text-foreground mt-0.5">
                    {profile.subscriberCountText || "N/A"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Avg Viral Velocity</p>
                  <p className="text-xl md:text-2xl font-display font-bold text-red-400 mt-0.5">
                    {envyMetrics.averageViralVelocity}<span className="text-xs text-muted-foreground">/100</span>
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Niche CPM</p>
                  <p className="text-xl md:text-2xl font-display font-bold text-primary mt-0.5">
                    {envyMetrics.nicheCpm}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Competitor Quick Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {competitors.map((comp, idx) => {
              const velocityColor = (comp.viralVelocityScore || 0) >= 70 ? 'border-red-500/40 bg-red-500/5' : (comp.viralVelocityScore || 0) >= 40 ? 'border-yellow-500/40 bg-yellow-500/5' : 'border-green-500/40 bg-green-500/5';
              return (
                <div key={comp.videoId} className={`p-3 rounded-xl border ${velocityColor} transition-all hover:scale-[1.01]`}>
                  <div className="flex items-start gap-3">
                    <img src={comp.thumbnail} alt={comp.title} className="w-20 h-12 rounded-lg object-cover bg-black/40 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-foreground line-clamp-2 leading-tight">{comp.title}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{comp.channelName}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[10px] font-bold text-green-400 flex items-center gap-0.5">
                      <DollarSign className="w-3 h-3" />{comp.estimatedRevenue || "N/A"}
                    </span>
                    <span className="text-[10px] font-bold text-red-400 flex items-center gap-0.5">
                      <Flame className="w-3 h-3" />{comp.viralVelocityScore || 0}
                    </span>
                    <span className="text-[10px] text-muted-foreground ml-auto">{comp.views}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* CTA to Clone & Crush */}
          <div className="flex items-center justify-center">
            <Link to="/clone-crush">
              <Button className="cyber-button text-xs gap-1.5 font-display h-10 px-6">
                <Zap className="w-3.5 h-3.5 text-primary-foreground fill-primary-foreground" />
                Open Clone &amp; Crush to Crush These Competitors
              </Button>
            </Link>
          </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="showdown" className="mt-0">
            <Suspense
              fallback={(
                <Card className="cyber-card flex min-h-[280px] items-center justify-center border-border/70">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </Card>
              )}
            >
              <CompetitorShowdown />
            </Suspense>
          </TabsContent>
        </Tabs>
      )}

      {/* Stats Grid — memoized cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {statDefs.map((stat) => (
          <StatCard key={stat.key} label={stat.label} value={stat.value} icon={stat.icon} color={stat.color} />
        ))}
      </div>

      {/* Non-critical product discovery module — deferred until near viewport. */}
      <DeferredModule minHeight={220} className="content-auto">
        <Suspense fallback={<div className="h-[220px] rounded-2xl border border-border/50 bg-card/40" />}>
          <TheLab />
        </Suspense>
      </DeferredModule>

      {/* Unified 8-Tool Grid — memoized */}
      <div>
        <h2 className="font-display text-lg md:text-xl font-semibold text-foreground mb-4 md:mb-5 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          Start Creating
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
          {tools.map((tool, index) => (
            <ToolCard key={tool.path} tool={tool} index={index} />
          ))}
        </div>
      </div>

      {/* Recent Content & Export — uses Zustand reactive store */}
      <div className="grid lg:grid-cols-2 gap-5 md:gap-6">
        <Card className="cyber-card border-border">
          <CardHeader className="pb-3 md:pb-4">
            <CardTitle className="font-display text-base md:text-lg text-foreground">Your Creations</CardTitle>
            <CardDescription className="text-sm text-muted-foreground">{totalContent > 0 ? `${totalContent} items saved (Zustand persisted)` : "Nothing yet - tap a button above!"}</CardDescription>
          </CardHeader>
          <CardContent>
            {recentContent.length > 0 ? (
              <div className="space-y-3">
                {recentContent.map((content) => {
                  const Icon = getContentIcon(content.type);
                  return (
                    <div key={content.id} className="group relative flex items-center gap-3 p-3 md:p-4 bg-secondary/50 backdrop-blur-sm rounded-xl border border-border/30 hover:border-primary/30 transition-all">
                      <button
                        onClick={() => handleDeleteItem(content.id)}
                        className="absolute -top-2 -right-2 z-10 w-7 h-7 rounded-full bg-secondary/90 border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-destructive/20 hover:border-destructive/50 transition-all opacity-0 group-hover:opacity-100 touch-manipulation active:scale-90"
                        aria-label="Remove item"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                      <div className="w-10 h-10 md:w-11 md:h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <Icon className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm md:text-base text-foreground truncate font-medium">{content.title}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                          <span className="capitalize">{content.type}</span>
                          <span>•</span>
                          <span>{new Date(content.createdAt).toLocaleDateString()}</span>
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 md:py-10">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                  <Sparkles className="w-8 h-8 text-primary animate-pulse" />
                </div>
                <p className="text-base text-foreground font-medium mb-1">Ready to create?</p>
                <p className="text-sm text-muted-foreground">Tap any button above — Zustand will cache instantly</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="cyber-card border-border">
          <CardHeader className="pb-3 md:pb-4">
            <CardTitle className="font-display text-base md:text-lg text-foreground">Render &amp; Export</CardTitle>
            <CardDescription className="text-xs md:text-sm text-muted-foreground">Download or render your content</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 md:space-y-4">
            <Button onClick={handleExportAll} disabled={isExporting || isClearing || totalContent === 0} className="w-full cyber-button text-primary-foreground h-11 md:h-12">
              {isExporting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating ZIP...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Export All as ZIP ({totalContent})
                </>
              )}
            </Button>

            <Button variant="outline" onClick={handleClearAll} disabled={isExporting || isClearing || totalContent === 0} className="w-full border-destructive/50 text-destructive hover:bg-destructive/10 h-10 md:h-11">
              {isClearing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Clearing...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Clear All Content
                </>
              )}
            </Button>

            <div className="p-3 rounded-lg bg-secondary/50 border border-border">
              <p className="text-xs text-muted-foreground">
                <strong className="text-foreground">ZIP includes:</strong>
              </p>
              <ul className="text-xs text-muted-foreground mt-1 space-y-0.5">
                <li>✓ Scripts (full text)</li>
                <li>✓ Thumbnail Prompts (text-based)</li>
                <li>✓ Guides (markdown)</li>
                <li>✓ Voiceover transcripts</li>
              </ul>
              <p className="text-xs text-muted-foreground/70 mt-2 border-t border-border/50 pt-2">Note: Audio files must be downloaded from Voiceover Studio</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
