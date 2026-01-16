import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Bot, Image, Eye, Mic, FileText, Download, Trash2, ArrowUpRight, Package } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getStats, getSavedContent, clearAllContent, type Stats, type SavedContent } from "@/lib/stats";
import { exportAllAsZip } from "@/lib/export";

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
    title: "SnapGuide Vision",
    description: "Screenshots to step-by-step tutorials",
    icon: Eye,
    path: "/vision-guide",
    gradient: "from-green-400 to-emerald-600",
    glow: "",
  },
  {
    title: "Voiceover Studio",
    description: "Text-to-speech with speed & pitch control",
    icon: Mic,
    path: "/voice",
    gradient: "from-orange-400 to-red-500",
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

  useEffect(() => {
    // Load stats from localStorage
    const loadedStats = getStats();
    setStats(loadedStats);

    // Load recent content
    const content = getSavedContent();
    setRecentContent(content.slice(0, 5));

    // Listen for storage changes
    const handleStorageChange = () => {
      setStats(getStats());
      setRecentContent(getSavedContent().slice(0, 5));
    };

    window.addEventListener('storage', handleStorageChange);
    
    // Also check periodically for same-tab updates
    const interval = setInterval(handleStorageChange, 2000);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  const handleExportAll = async () => {
    setIsExporting(true);
    try {
      await exportAllAsZip();
      toast.success("All content exported as ZIP!");
    } catch (error: any) {
      toast.error(error.message || "Failed to export content");
    } finally {
      setIsExporting(false);
    }
  };

  const handleClearAll = () => {
    if (confirm("Are you sure you want to delete all saved content? This cannot be undone.")) {
      clearAllContent();
      setStats(getStats());
      setRecentContent([]);
      toast.success("All content cleared!");
    }
  };

  const statCards = [
    { 
      label: "Scripts Generated", 
      value: stats.scriptsGenerated, 
      icon: FileText, 
      color: "text-primary" 
    },
    { 
      label: "Thumbnails Created", 
      value: stats.thumbnailsCreated, 
      icon: Image, 
      color: "text-accent" 
    },
    { 
      label: "Voiceovers Made", 
      value: stats.voiceoversGenerated, 
      icon: Mic, 
      color: "text-orange-400" 
    },
    { 
      label: "Guides Created", 
      value: stats.guidesCreated, 
      icon: Eye, 
      color: "text-green-400" 
    },
  ];

  const getContentIcon = (type: SavedContent['type']) => {
    switch (type) {
      case 'script': return FileText;
      case 'thumbnail': return Image;
      case 'voiceover': return Mic;
      case 'guide': return Eye;
      default: return FileText;
    }
  };

  return (
    <div className="space-y-6 md:space-y-8 animate-fade-in">
      {/* Welcome Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-primary/20 via-card to-accent/20 p-6 md:p-8 border border-border gradient-border">
        <div className="relative z-10">
          <h1 className="font-display text-2xl md:text-3xl lg:text-4xl font-bold text-foreground mb-2">
            Hello Creator! <span className="animate-pulse">👋</span>
          </h1>
          <p className="text-base md:text-lg text-muted-foreground max-w-xl">
            Ready to make a <span className="text-primary text-glow-purple font-semibold">viral video</span>? 
            Pick a tool below and start creating.
          </p>
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

      {/* Tools Grid */}
      <div>
        <h2 className="font-display text-lg md:text-xl font-semibold text-foreground mb-3 md:mb-4">Quick Actions</h2>
        <div className="grid md:grid-cols-2 gap-3 md:gap-4">
          {tools.map((tool, index) => (
            <Link 
              key={tool.path} 
              to={tool.path}
              className="group"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <Card className={`cyber-card border-border hover:border-primary/50 transition-all duration-300 h-full ${tool.glow} hover:scale-[1.02] active:scale-[0.98]`}>
                <CardContent className="p-4 md:p-6 flex items-start gap-3 md:gap-4">
                  <div className={`w-12 h-12 md:w-14 md:h-14 rounded-xl bg-gradient-to-br ${tool.gradient} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform`}>
                    <tool.icon className="w-6 h-6 md:w-7 md:h-7 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-display font-semibold text-sm md:text-base text-foreground group-hover:text-primary transition-colors truncate">
                        {tool.title}
                      </h3>
                      <ArrowUpRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </div>
                    <p className="text-xs md:text-sm text-muted-foreground mt-1">{tool.description}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent Content & Export */}
      <div className="grid lg:grid-cols-2 gap-4 md:gap-6">
        {/* Recent Content */}
        <Card className="cyber-card border-border">
          <CardHeader className="pb-3 md:pb-4">
            <CardTitle className="font-display text-base md:text-lg text-foreground">Recent Content</CardTitle>
            <CardDescription className="text-xs md:text-sm text-muted-foreground">Your latest creations</CardDescription>
          </CardHeader>
          <CardContent>
            {recentContent.length > 0 ? (
              <div className="space-y-2">
                {recentContent.map((content) => {
                  const Icon = getContentIcon(content.type);
                  return (
                    <div key={content.id} className="flex items-center gap-3 p-2 md:p-3 bg-secondary rounded-lg">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Icon className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs md:text-sm text-foreground truncate">{content.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(content.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-6 md:py-8">
                <FileText className="w-10 h-10 md:w-12 md:h-12 mx-auto text-muted-foreground mb-2" />
                <p className="text-xs md:text-sm text-muted-foreground">No content yet. Start creating!</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Export Section */}
        <Card className="cyber-card border-border">
          <CardHeader className="pb-3 md:pb-4">
            <CardTitle className="font-display text-base md:text-lg text-foreground">Export Center</CardTitle>
            <CardDescription className="text-xs md:text-sm text-muted-foreground">Download all your content</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 md:space-y-4">
            <Button
              onClick={handleExportAll}
              disabled={isExporting || recentContent.length === 0}
              className="w-full cyber-button text-primary-foreground h-11 md:h-12"
              aria-label="Export all content as ZIP file"
            >
              {isExporting ? (
                <>
                  <Package className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" aria-hidden="true" />
                  Export All as ZIP
                </>
              )}
            </Button>

            <Button
              variant="outline"
              onClick={handleClearAll}
              disabled={recentContent.length === 0}
              className="w-full border-destructive/50 text-destructive hover:bg-destructive/10 h-10 md:h-11"
              aria-label="Clear all saved content"
            >
              <Trash2 className="w-4 h-4 mr-2" aria-hidden="true" />
              Clear All Content
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              ZIP includes: Scripts, Thumbnails (base64), Guides, Voiceover transcripts
            </p>
            <p className="text-xs text-center text-muted-foreground/70 mt-1">
              Note: Audio files must be downloaded directly from Voiceover Studio
            </p>
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
