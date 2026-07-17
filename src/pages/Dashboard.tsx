import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Bot, Image, Eye, Mic, FileText, Download, Trash2, ArrowUpRight, Film, Loader2, X, Sparkles, RefreshCw, Share2, TrendingUp, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getStats, getSavedContent, clearAllContent, deleteContent, type Stats, type SavedContent } from "@/lib/stats";
import { exportAllAsZip } from "@/lib/export";
import { VerificationModal } from "@/components/VerificationModal";


const tools = [
  {
    title: "TubeBot AI Agent",
    description: "Generate viral titles, hooks & scripts",
    icon: Bot,
    path: "/chat-agent",
    gradient: "from-neon-purple to-pink-500",
    glow: "neon-glow-purple",
  },
  {
    title: "Thumbnail Architect",
    description: "Create 4 AI thumbnails at once",
    icon: Image,
    path: "/thumbnails",
    gradient: "from-neon-cyan to-blue-500",
    glow: "neon-glow-cyan",
  },
  {
    title: "Visual Storyboard",
    description: "Cinematic frames from your script",
    icon: Film,
    path: "/storyboard",
    gradient: "from-purple-400 to-violet-600",
    glow: "",
  },
  {
    title: "SnapGuide Vision",
    description: "Screenshots to step-by-step tutorials",
    icon: Eye,
    path: "/vision-guide",
    gradient: "from-green-400 to-emerald-600",
    glow: "",
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

export default function Dashboard() {
  const [stats, setStats] = useState<Stats>({
    scriptsGenerated: 0,
    thumbnailsCreated: 0,
    voiceoversGenerated: 0,
    guidesCreated: 0,
    lastUpdated: new Date().toISOString(),
  });
  const [recentContent, setRecentContent] = useState<SavedContent[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [verificationOpen, setVerificationOpen] = useState(false);

  useEffect(() => {
    const loadedStats = getStats();
    setStats(loadedStats);
    const content = getSavedContent();
    setRecentContent(content.slice(0, 5));

    const handleStorageChange = () => {
      setStats(getStats());
      setRecentContent(getSavedContent().slice(0, 5));
    };

    window.addEventListener('storage', handleStorageChange);
    const interval = setInterval(handleStorageChange, 2000);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  const doExport = async () => {
    setIsExporting(true);
    try {
      await exportAllAsZip();
      toast.success("All content exported as ZIP!");
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Failed to export content";
      toast.error(errorMessage);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportAll = () => {
    if (recentContent.length === 0) {
      toast.error("No content to export. Create some content first!");
      return;
    }
    setVerificationOpen(true);
  };

  const handleVerified = () => {
    doExport();
  };

  const handleClearAll = () => {
    if (recentContent.length === 0) {
      toast.info("No content to clear");
      return;
    }
    if (confirm("Are you sure you want to delete all saved content? This cannot be undone.")) {
      setIsClearing(true);
      try {
        clearAllContent();
        setStats(getStats());
        setRecentContent([]);
        toast.success("All content cleared!");
      } catch {
        toast.error("Failed to clear content");
      } finally {
        setIsClearing(false);
      }
    }
  };

  const statCards = [
    { label: "Scripts Generated", value: stats.scriptsGenerated, icon: FileText, color: "text-primary" },
    { label: "Thumbnails Created", value: stats.thumbnailsCreated, icon: Image, color: "text-accent" },
    { label: "Voiceovers Made", value: stats.voiceoversGenerated, icon: Mic, color: "text-orange-400" },
    { label: "Guides Created", value: stats.guidesCreated, icon: Eye, color: "text-green-400" },
  ];

  const getContentIcon = (type: SavedContent['type']) => {
    switch (type) {
      case 'script': return FileText;
      case 'thumbnail': return Image;
      case 'voiceover': return Mic;
      case 'guide': return Eye;
      case 'storyboard': return Film;
      default: return FileText;
    }
  };

  const handleDeleteItem = (id: string) => {
    deleteContent(id);
    setRecentContent(getSavedContent().slice(0, 5));
    setStats(getStats());
    toast.success("Item removed");
  };

  const totalContent = getSavedContent().length;

  return (
    <div className="space-y-6 md:space-y-8 animate-fade-in">
      <VerificationModal
        open={verificationOpen}
        onOpenChange={setVerificationOpen}
        onVerified={handleVerified}
      />

      {/* Welcome Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-primary/20 via-card to-accent/20 p-5 md:p-8 border border-border gradient-border">
        <div className="relative z-10">
          <h1 className="font-display text-2xl md:text-3xl lg:text-4xl font-bold text-foreground mb-2 md:mb-3">
            Hello Creator! <span className="animate-pulse">👋</span>
          </h1>
          <p className="text-base md:text-lg text-muted-foreground max-w-xl leading-relaxed">
            Ready to make a <span className="text-primary text-glow-purple font-semibold">viral video</span>?
            Tap a button below to start.
          </p>
          {totalContent > 0 && (
            <div className="mt-4 flex gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearAll}
                disabled={isExporting || isClearing}
                className="border-destructive/40 text-destructive hover:bg-destructive/10 h-10 px-4 text-sm"
              >
                {isClearing ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                Clear All ({totalContent})
              </Button>
            </div>
          )}
        </div>
        <div className="absolute -right-10 -top-10 w-40 h-40 bg-primary/30 rounded-full blur-3xl" />
        <div className="absolute -right-20 -bottom-10 w-60 h-60 bg-accent/20 rounded-full blur-3xl" />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {statCards.map((stat) => (
          <Card key={stat.label} className="cyber-card border-border hover:border-primary/30 transition-colors">
            <CardContent className="p-3 md:p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs md:text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-2xl md:text-3xl font-display font-bold text-foreground mt-1">{stat.value}</p>
                </div>
                <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <stat.icon className={`w-4 h-4 md:w-5 md:h-5 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Unified 8-Tool Grid */}
      <div>
        <h2 className="font-display text-lg md:text-xl font-semibold text-foreground mb-4 md:mb-5 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          Start Creating
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
          {tools.map((tool, index) => (
              <Link
                key={tool.path}
                to={tool.path}
                className="group touch-manipulation"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className={cn(
                  "relative rounded-2xl border backdrop-blur-md bg-card/80 shadow-lg",
                  "border-border/50 transition-all duration-300",
                  "hover:shadow-xl hover:border-primary/50 hover:scale-[1.02]",
                  "active:scale-[0.98]",
                  tool.glow
                )}>
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
          ))}
        </div>
      </div>

      {/* Recent Content & Export */}
      <div className="grid lg:grid-cols-2 gap-5 md:gap-6">
        {/* Recent Content */}
        <Card className="cyber-card border-border">
          <CardHeader className="pb-3 md:pb-4">
            <CardTitle className="font-display text-base md:text-lg text-foreground">Your Creations</CardTitle>
            <CardDescription className="text-sm text-muted-foreground">
              {totalContent > 0 ? `${totalContent} items saved` : "Nothing yet - tap a button above!"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recentContent.length > 0 ? (
              <div className="space-y-3">
                {recentContent.map((content) => {
                  const Icon = getContentIcon(content.type);
                  return (
                    <div
                      key={content.id}
                      className="group relative flex items-center gap-3 p-3 md:p-4 bg-secondary/50 backdrop-blur-sm rounded-xl border border-border/30 hover:border-primary/30 transition-all"
                    >
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
                <p className="text-sm text-muted-foreground">Tap any button above to get started!</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Render & Export */}
        <Card className="cyber-card border-border">
          <CardHeader className="pb-3 md:pb-4">
            <CardTitle className="font-display text-base md:text-lg text-foreground">Render &amp; Export</CardTitle>
            <CardDescription className="text-xs md:text-sm text-muted-foreground">Download or render your content</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 md:space-y-4">
            <Button
              onClick={handleExportAll}
              disabled={isExporting || isClearing || totalContent === 0}
              className="w-full cyber-button text-primary-foreground h-11 md:h-12"
              aria-label="Export all content as ZIP file"
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
                  Creating ZIP...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" aria-hidden="true" />
                  Export All as ZIP ({totalContent})
                </>
              )}
            </Button>




            <Button
              variant="outline"
              onClick={handleClearAll}
              disabled={isExporting || isClearing || totalContent === 0}
              className="w-full border-destructive/50 text-destructive hover:bg-destructive/10 h-10 md:h-11"
              aria-label="Clear all saved content"
            >
              {isClearing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
                  Clearing...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" aria-hidden="true" />
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
                <li>✓ Thumbnails (base64 images)</li>
                <li>✓ Guides (markdown)</li>
                <li>✓ Voiceover transcripts</li>
                <li>✓ Storyboard descriptions</li>
              </ul>
              <p className="text-xs text-muted-foreground/70 mt-2 border-t border-border/50 pt-2">
                Note: Audio files must be downloaded from Voiceover Studio
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sponsor Block */}
      <Card className="cyber-card border-dashed border-border/50">
        <CardContent className="p-4 md:p-6 text-center">
          <p className="text-muted-foreground text-xs md:text-sm">
            <span className="font-display text-xs uppercase tracking-wider">Sponsored</span>
          </p>
          <p className="text-foreground mt-2 text-sm md:text-base">Your Ad Could Be Here</p>
          <p className="text-xs text-muted-foreground mt-1">Contact us for sponsorship opportunities</p>
        </CardContent>
      </Card>
    </div>
  );
}
