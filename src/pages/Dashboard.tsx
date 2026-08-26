import { lazy, memo, Suspense, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Image as ImageIcon, Eye, Mic, FileText, Download, Trash2, ArrowUpRight, Loader2, X, Sparkles, RefreshCw, Share2, TrendingUp, Search, Zap, DollarSign, Flame, Gauge, AlertTriangle, Terminal, Cpu, Activity,
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
import { AudienceIntelligenceSection } from "@/components/audience/AudienceIntelligenceSection";
import { useCloneCrushStore } from "@/stores/useCloneCrushStore";
import { LocalInsightPanel } from "@/components/intelligence/LocalInsightPanel";
import { LocalSignalBoard } from "@/components/intelligence/LocalSignalBoard";

const ViralGrowthPass = lazy(() => import("@/components/referrals/ViralGrowthPass").then(m => ({ default: m.ViralGrowthPass })));
const CompetitorShowdown = lazy(() => import("@/components/showdown/CompetitorShowdown").then(m => ({ default: m.CompetitorShowdown })));
const TheLab = lazy(() => import("@/components/lab/TheLab").then(m => ({ default: m.TheLab })));

const tools = [
  { title: "Clone & Crush AI", description: "Analyze winners and generate 5 ready-to-use assets in 1 click", icon: Zap, path: "/clone-crush", gradient: "from-purple-600 via-indigo-600 to-cyan-500", glow: "neon-glow-purple" },
  { title: "Voiceover Studio", description: "Cinematic AI voiceovers • Neural Engine", icon: Mic, path: "/voice", gradient: "from-orange-400 to-red-500", glow: "" },
  { title: "Multi-Platform Repurposer", description: "Convert scripts to X, IG, LinkedIn & YouTube", icon: Share2, path: "/repurposer", gradient: "from-pink-500 to-rose-600", glow: "" },
  { title: "Channel Analytics & ROI", description: "Simulate growth, AdSense & brand deals", icon: TrendingUp, path: "/analytics", gradient: "from-blue-500 to-indigo-600", glow: "" },
  { title: "SEO Tag & Competitor AI", description: "High-CTR tags & search volume audit", icon: Search, path: "/seo", gradient: "from-emerald-500 to-teal-600", glow: "" },
];

const StatCard = memo(function StatCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: any; color: string }) {
  return (
    <Card className="glass-strong border-border hover:border-primary/30 transition-colors bracket">
      <CardContent className="p-3 md:p-4">
        <div className="flex items-start justify-between">
          <div><p className="text-xs md:text-sm text-muted-foreground">{label}</p><p className="text-2xl md:text-3xl font-display font-bold text-foreground mt-1">{value}</p><p className="text-[9px] font-mono text-primary/60 mt-1">Synced • just now</p></div>
          <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-primary/10 flex items-center justify-center"><Icon className={`w-4 h-4 md:w-5 md:h-5 ${color}`} /></div>
        </div>
      </CardContent>
    </Card>
  );
});

const ToolCard = memo(function ToolCard({ tool, index }: { tool: typeof tools[0]; index: number }) {
  return (
    <Link to={tool.path} className="group touch-manipulation" style={{ animationDelay: `${index * 100}ms` }}>
      <div className={cn("relative rounded-2xl border backdrop-blur-md bg-card/80 shadow-lg", "border-border/50 transition-all duration-300", "hover:shadow-xl hover:border-primary/50 hover:scale-[1.02]", "active:scale-[0.98]", tool.glow, "bracket")}>
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/5 to-accent/5 pointer-events-none" />
        <div className="absolute inset-0 ghost-scanline opacity-[0.02] pointer-events-none" />
        <div className="relative p-5 md:p-6 flex items-center gap-4">
          <div className={`w-14 h-14 md:w-16 md:h-16 rounded-xl bg-gradient-to-br ${tool.gradient} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform shadow-lg`}><tool.icon className="w-7 h-7 md:w-8 md:h-8 text-white" /></div>
          <div className="flex-1 min-w-0"><div className="flex items-center gap-2"><h3 className="font-display font-semibold text-base md:text-lg text-foreground group-hover:text-primary transition-colors">{tool.title}</h3><ArrowUpRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" /></div><p className="text-sm text-muted-foreground mt-1 leading-relaxed">{tool.description}</p></div>
        </div>
      </div>
    </Link>
  );
});

export default function Dashboard() {
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
    try { const { exportAllAsZip } = await import("@/lib/export"); await exportAllAsZip(); toast.success("Export complete — your ZIP is ready"); } catch (error: any) { toast.error(error instanceof Error ? error.message : "Export failed"); } finally { setIsExporting(false); }
  }, []);

  const handleExportAll = useCallback(() => {
    if (totalContent === 0) { toast.error("Nothing to export yet — save something first"); return; }
    setVerificationOpen(true);
  }, [totalContent]);

  const handleClearAll = useCallback(() => {
    if (totalContent === 0) { toast.info("No content"); return; }
    if (confirm("Delete all saved content? This cannot be undone.")) {
      setIsClearing(true);
      try { clearAll(); toast.success("Library cleared"); } catch { toast.error("Clear failed — please try again"); } finally { setIsClearing(false); }
    }
  }, [totalContent, clearAll]);

  const handleDeleteItem = useCallback((id: string) => { deleteContent(id); toast.success("Item deleted"); }, [deleteContent]);
  const getContentIcon = useCallback((type: SavedContent["type"]) => { switch (type) { case "script": return FileText; case "thumbnail": return ImageIcon; case "voiceover": return Mic; case "guide": return Eye; default: return FileText; } }, []);
  const statDefs = [
    { key: "scripts", label: "Scripts Generated", value: stats.scriptsGenerated, icon: FileText, color: "text-primary" },
    { key: "thumbs", label: "Thumbnail Prompts", value: stats.thumbnailsCreated, icon: ImageIcon, color: "text-accent" },
    { key: "voice", label: "Voiceovers Made", value: stats.voiceoversGenerated, icon: Mic, color: "text-orange-400" },
    { key: "guides", label: "Guides Created", value: stats.guidesCreated, icon: Eye, color: "text-green-400" },
  ];

  return (
    <div className="relative space-y-6 md:space-y-8 animate-fade-in">
      <div className="relative z-10 space-y-6">
        <VerificationModal open={verificationOpen} onOpenChange={setVerificationOpen} onVerified={doExport} />

        {profile ? (
          <div className="relative overflow-hidden rounded-2xl glass-strong border-primary/20 min-h-[160px] md:min-h-[200px] bracket">
            <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:20px_20px] opacity-30" />
            <div className="absolute inset-0 ghost-scanline opacity-[0.02]" />
            <div className="relative z-10 p-5 md:p-8 flex flex-col md:flex-row items-start md:items-center gap-5 h-full">
              <div className="relative group shrink-0"><div className="absolute -inset-1 rounded-full bg-gradient-to-r from-neon-purple to-neon-cyan opacity-75 blur-sm animate-pulse" /><img src={profile.avatar} alt={profile.name} className="relative w-16 h-16 md:w-20 md:h-20 rounded-full border-2 border-background object-cover bg-card" /></div>
              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="flex items-center flex-wrap gap-2"><h1 className="font-display text-xl md:text-2xl lg:text-3xl font-bold text-foreground truncate">{profile.name}</h1><span className="px-2.5 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30 font-display text-[10px] uppercase tracking-wider font-semibold">Verified creator</span>{envyMetrics && <span className="px-2.5 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 font-display text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1"><Flame className="w-3 h-3" />{competitors.length} competitors tracked</span>}</div>
                <p className="text-xs md:text-sm text-primary font-medium tracking-wide flex items-center gap-2">{profile.handle} {profile.subscriberCountText && `• ${profile.subscriberCountText} subs`}</p>
                <p className="text-xs md:text-sm text-muted-foreground max-w-2xl line-clamp-2 leading-relaxed">{profile.description}</p>
                <p className="text-[10px] text-muted-foreground/60 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />Profiled on {new Date(profile.profiledAt).toLocaleDateString()}</p>
              </div>
              <div className="self-end md:self-center shrink-0"><Link to="/clone-crush"><Button size="sm" className="cyber-button text-xs gap-1.5 font-display"><Zap className="w-3.5 h-3.5 fill-primary-foreground" />Open Clone &amp; Crush</Button></Link></div>
            </div>
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-2xl glass-strong border-primary/20 p-5 md:p-8 bracket">
            <div className="absolute inset-0 ghost-grid opacity-10" />
            <div className="relative z-10"><h1 className="font-display text-2xl md:text-3xl lg:text-4xl font-black mb-2 bg-gradient-to-r from-red-400 via-orange-400 to-yellow-400 text-transparent bg-clip-text">Your Competitors Are Growing. <span className="text-red-400 animate-pulse">Are You?</span></h1><p className="text-base md:text-lg text-muted-foreground max-w-xl leading-relaxed">See who's winning your audience, what they earn, and clone the formula that works — in minutes.</p><div className="mt-3 flex items-center gap-2"><Link to="/clone-crush"><Button size="sm" className="cyber-button text-xs gap-1.5 font-display"><Zap className="w-3.5 h-3.5 fill-primary-foreground" />Start competitor analysis</Button></Link></div></div>
          </div>
        )}

        <AudienceIntelligenceSection />
        <WorkflowContinueCard />
        <Suspense fallback={<div className="h-28 animate-pulse rounded-2xl border border-border bg-card/60" />}><ViralGrowthPass /></Suspense>

        {competitors.length > 0 && (
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="grid h-auto w-full max-w-md grid-cols-2 border border-border/60 bg-card/70 p-1"><TabsTrigger value="overview" className="gap-2 py-2"><TrendingUp className="h-4 w-4" />Overview</TabsTrigger><TabsTrigger value="showdown" className="gap-2 py-2"><Gauge className="h-4 w-4" />Competitors</TabsTrigger></TabsList>
            <TabsContent value="overview" className="mt-0">
              {profile && envyMetrics && (
                <div className="space-y-4 animate-fade-in">
                  <h2 className="font-display text-lg md:text-xl font-semibold text-foreground flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-red-400 animate-pulse" /><span className="bg-gradient-to-r from-red-400 to-orange-400 text-transparent bg-clip-text">Competitor snapshot</span></h2>
                  {threatAlerts.length>0 && <div className="space-y-2">{threatAlerts.slice(0,2).map((a:any,i:number)=><div key={i} className={`p-3 rounded-xl border flex items-center gap-3 backdrop-blur-sm ${a.type==='critical'?'bg-red-500/10 border-red-500/30':'bg-yellow-500/10 border-yellow-500/20'}`}><span className="text-lg shrink-0">{a.icon}</span><p className={`text-xs font-bold flex-1 ${a.type==='critical'?'text-red-400':'text-yellow-400'}`}>{a.message}</p></div>)}{wideningGap && wideningGap.dailyLoss>0 && <div className="p-3 rounded-xl glass-strong border-red-500/15 flex items-center gap-3"><TrendingUp className="w-4 h-4 text-red-400 shrink-0" /><p className="text-[10px] font-bold text-red-400 flex-1">📉 Widening Gap: ~${wideningGap.dailyLoss.toLocaleString()}/day — ${wideningGap.monthlyLoss.toLocaleString()}/mo slipping • live estimate</p><Link to="/clone-crush"><Button size="sm" className="cyber-button text-[9px] h-7 px-2 font-display">Crush it now</Button></Link></div>}</div>}
                  <div className="p-4 md:p-5 rounded-2xl glass-strong border-red-500/20 relative overflow-hidden"><div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 rounded-full blur-2xl pointer-events-none" /><div className="relative z-10"><p className="text-[10px] text-red-400 font-mono uppercase tracking-widest font-bold mb-2">🔴 Revenue gap • niche: {envyMetrics.niche}</p><div className="grid grid-cols-2 md:grid-cols-4 gap-4"><div><p className="text-xs text-muted-foreground">Competitors Earn (est.)</p><p className="text-xl md:text-2xl font-display font-bold text-green-400 mt-0.5">{envyMetrics.totalCompetitorMonthlyRevenue}<span className="text-xs text-muted-foreground">/mo</span></p></div><div><p className="text-xs text-muted-foreground">Your Subs</p><p className="text-xl md:text-2xl font-display font-bold text-foreground mt-0.5">{profile.subscriberCountText || "N/A"}</p></div><div><p className="text-xs text-muted-foreground">Avg Velocity</p><p className="text-xl md:text-2xl font-display font-bold text-red-400 mt-0.5">{envyMetrics.averageViralVelocity}<span className="text-xs text-muted-foreground">/100</span></p></div><div><p className="text-xs text-muted-foreground">Niche CPM</p><p className="text-xl md:text-2xl font-display font-bold text-primary mt-0.5">{envyMetrics.nicheCpm}</p></div></div></div></div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">{competitors.map((comp:any)=><div key={comp.videoId} className={`p-3 rounded-xl glass-strong border transition-all hover:scale-[1.01] ${ (comp.viralVelocityScore||0)>=70 ? 'border-red-500/20' : 'border-border/40'}`}><div className="flex items-start gap-3"><img src={comp.thumbnail} alt={comp.title} className="w-20 h-12 rounded-lg object-cover bg-black/40 shrink-0" /><div className="flex-1 min-w-0"><p className="text-xs font-bold text-foreground line-clamp-2 leading-tight">{comp.title}</p><p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">{comp.channelName} {(comp as any).isGhostReconstructed && <span className="text-[8px] bg-amber-500/10 text-amber-300 border border-amber-500/20 px-1 rounded">est.</span>}</p></div></div><div className="flex items-center gap-2 mt-2"><span className="text-[10px] font-bold text-green-400 flex items-center gap-0.5"><DollarSign className="w-3 h-3" />{comp.estimatedRevenue || "N/A"}</span><span className="text-[10px] font-bold text-red-400 flex items-center gap-0.5"><Flame className="w-3 h-3" />{comp.viralVelocityScore || 0}</span><span className="text-[10px] text-muted-foreground ml-auto">{comp.views}</span></div></div>)}</div>
                  <div className="flex items-center justify-center"><Link to="/clone-crush"><Button className="cyber-button text-xs gap-1.5 font-display h-10 px-6"><Zap className="w-3.5 h-3.5 fill-primary-foreground" />Crush your competitors</Button></Link></div>
                </div>
              )}
            </TabsContent>
            <TabsContent value="showdown" className="mt-0"><Suspense fallback={<Card className="cyber-card flex min-h-[280px] items-center justify-center border-border/70"><Loader2 className="h-6 w-6 animate-spin text-primary" /></Card>}><CompetitorShowdown /></Suspense></TabsContent>
          </Tabs>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">{statDefs.map(stat=> <StatCard key={stat.key} label={stat.label} value={stat.value} icon={stat.icon} color={stat.color} />)}</div>

        <div className="grid xl:grid-cols-2 gap-5">
          <LocalInsightPanel />
          <LocalSignalBoard />
        </div>

        <DeferredModule minHeight={220} className="content-auto"><Suspense fallback={<div className="h-[220px] rounded-2xl border border-border/50 bg-card/40" />}><TheLab /></Suspense></DeferredModule>

        <div><h2 className="font-display text-lg md:text-xl font-semibold text-foreground mb-4 flex items-center gap-2"><Sparkles className="w-5 h-5 text-primary" />Start creating</h2><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">{tools.map((tool,index)=><ToolCard key={tool.path} tool={tool} index={index} />)}</div></div>

        <div className="grid lg:grid-cols-2 gap-5 md:gap-6">
          <Card className="glass-strong border-border"><CardHeader className="pb-3"><CardTitle className="font-display text-base flex items-center gap-2"><Terminal className="w-4 h-4 text-primary" />Your Library</CardTitle><CardDescription className="text-sm text-muted-foreground flex items-center gap-1"><Cpu className="w-3 h-3" />{totalContent>0?`${totalContent} saved items • synced`:"Nothing saved yet — pick a tool below to start!"}</CardDescription></CardHeader><CardContent>{recentContent.length>0 ? (<div className="space-y-3">{recentContent.map((content:any)=>{ const Icon = getContentIcon(content.type); return (<div key={content.id} className="group relative flex items-center gap-3 p-3 md:p-4 bg-secondary/50 backdrop-blur-sm rounded-xl border border-border/30 hover:border-primary/30 transition-all"><button onClick={()=>handleDeleteItem(content.id)} className="absolute -top-2 -right-2 z-10 w-7 h-7 rounded-full bg-secondary/90 border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-destructive/20 hover:border-destructive/50 transition-all opacity-0 group-hover:opacity-100"><X className="w-3.5 h-3.5" /></button><div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"><Icon className="w-5 h-5 text-primary" /></div><div className="flex-1 min-w-0"><p className="text-sm text-foreground truncate font-medium">{content.title}</p><p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5"><span className="capitalize">{content.type}</span><span>•</span><span>{new Date(content.createdAt).toLocaleDateString()}</span></p></div></div>);})}</div>) : (<div className="text-center py-8"><div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center mb-4"><Sparkles className="w-8 h-8 text-primary animate-pulse" /></div><p className="text-base text-foreground font-medium mb-1">Your library is empty</p><p className="text-sm text-muted-foreground">Run any tool above — everything you save appears here.</p></div>)}</CardContent></Card>
          <Card className="glass-strong border-border"><CardHeader className="pb-3"><CardTitle className="font-display text-base flex items-center gap-2"><Activity className="w-4 h-4 text-green-400" />Export &amp; Clear</CardTitle><CardDescription className="text-xs">Download everything as a ZIP, or clear it all.</CardDescription></CardHeader><CardContent className="space-y-3"><Button onClick={handleExportAll} disabled={isExporting || isClearing || totalContent===0} className="w-full cyber-button h-11">{isExporting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Exporting…</> : <><Download className="w-4 h-4 mr-2" />Export ZIP ({totalContent} items)</>}</Button><Button variant="outline" onClick={handleClearAll} disabled={isExporting || isClearing || totalContent===0} className="w-full border-destructive/50 text-destructive hover:bg-destructive/10 h-10"><Trash2 className="w-4 h-4 mr-2" />Clear library</Button><div className="p-3 rounded-lg bg-secondary/50 border border-border"><p className="text-xs text-muted-foreground"><strong className="text-foreground">ZIP includes:</strong></p><ul className="text-xs text-muted-foreground mt-1 space-y-0.5"><li>✓ Scripts</li><li>✓ Thumbnail prompts</li><li>✓ Guides (markdown)</li><li>✓ Voiceover transcripts</li></ul><p className="text-xs text-muted-foreground/70 mt-2 border-t border-border/50 pt-2 flex items-center gap-1"><Cpu className="w-3 h-3" />Includes voiceover transcripts • Audio available in Voiceover Studio</p></div></CardContent></Card>
        </div>
      </div>
    </div>
  );
}
