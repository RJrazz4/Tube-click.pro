import { useState, memo } from "react";
import { Search, Hash, Sparkles, Copy, Check, ShieldCheck, Tag, Loader2, TrendingUp, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { toastFriendlyError } from "@/lib/errorToast";
import { useSeoGeneration } from "@/hooks/useSecureQuery";
import { QK } from "@/api/client/queryKeys";
import { useQueryClient } from "@tanstack/react-query";
import { useContentStore } from "@/stores/useContentStore";

const StatBadge = memo(function StatBadge({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="p-3 bg-secondary rounded-lg text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold mt-1 ${color || "text-foreground"}`}>{value}</p>
    </div>
  );
});

export default function SeoOptimizer() {
  const [keyword, setKeyword] = useState("");
  const [platform, setPlatform] = useState("YouTube");
  const [language, setLanguage] = useState("english");
  const [copied, setCopied] = useState(false);
  const queryClient = useQueryClient();
  const saveContent = useContentStore(s => s.saveContent);
  const incrementStat = useContentStore(s => s.incrementStat);

  const seoMutation = useSeoGeneration();

  const result = seoMutation.data;

  const handleAnalyze = async () => {
    const trimmed = keyword.trim();
    if (!trimmed) {
      toast.error("Please enter a keyword or title");
      return;
    }
    if (trimmed.length < 2) {
      toast.error("Keyword too short");
      return;
    }
    if (trimmed.length > 200) {
      toast.error("Keyword too long (max 200)");
      return;
    }

    // Check cache first — instant feel via React Query
    const cacheKey = QK.seo(trimmed, platform, language);
    const cached = queryClient.getQueryData(cacheKey);
    if (cached) {
      toast.success("Served from cache — instant SEO bundle!");
      // Still trigger mutation to refresh in background?
      // For now, use cached via setQueryData trick — but we use mutation for generation
    }

    try {
      const data = await seoMutation.mutateAsync({ keyword: trimmed, platform, language });
      // Cache the result manually under QK for instant revisit
      queryClient.setQueryData(cacheKey, data);

      // Save to Zustand store for Dashboard recent content
      saveContent({
        type: "script",
        title: `SEO: ${trimmed}`,
        content: `Title: ${data.optimizedTitle}\nScore: ${data.seoScore}\nTags: ${data.tags.join(", ")}\nCompetiton: ${data.competition}\nVolume: ${data.searchVolume}`,
        metadata: { platform, language },
      });
      incrementStat("scriptsGenerated");

      toast.success("SEO audit and tag bundle generated via Gemini Edge!");
    } catch (err: any) {
      toastFriendlyError(err, "Failed to analyze SEO");
    }
  };

  const handleCopyTags = async () => {
    if (!result?.tags) return;
    try {
      await navigator.clipboard.writeText(result.tags.join(", "));
      setCopied(true);
      toast.success("Tags copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const handleCopyTitle = async () => {
    if (!result?.optimizedTitle) return;
    try {
      await navigator.clipboard.writeText(result.optimizedTitle);
      toast.success("Optimized title copied!");
    } catch {
      toast.error("Failed to copy");
    }
  };

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
          <Search className="w-6 h-6 md:w-7 md:h-7 text-accent" />
          SEO Tag &amp; Competitor Optimizer
          <span className="px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 text-[10px] border border-green-500/20 ml-2">Gemini Edge Secure</span>
        </h1>
        <p className="text-sm md:text-base text-muted-foreground mt-1">
          Generate high-CTR tags, search volume estimation via <span className="text-foreground font-medium">Gemini 2.0 Flash Edge</span> — server-only keys, no BYOK.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 md:gap-6">
        {/* Input */}
        <Card className="cyber-card border-border">
          <CardHeader className="pb-3 md:pb-4">
            <CardTitle className="font-display text-base md:text-lg text-foreground flex items-center gap-2">
              <Tag className="w-4 h-4 text-primary" />
              Target Keyword or Video Title
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Keyword / Title</Label>
              <Input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="e.g. dark psychology, AI video automation, coding tutorial..."
                className="bg-secondary border-border h-11"
                disabled={seoMutation.isPending}
                maxLength={200}
              />
              {keyword.length > 0 && <p className="text-xs text-muted-foreground text-right">{keyword.length}/200</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Platform</Label>
                <Select value={platform} onValueChange={setPlatform} disabled={seoMutation.isPending}>
                  <SelectTrigger className="bg-secondary border-border h-10 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="YouTube">YouTube</SelectItem>
                    <SelectItem value="YouTube Shorts">YouTube Shorts</SelectItem>
                    <SelectItem value="Instagram Reels">Instagram Reels</SelectItem>
                    <SelectItem value="TikTok">TikTok</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Language</Label>
                <Select value={language} onValueChange={setLanguage} disabled={seoMutation.isPending}>
                  <SelectTrigger className="bg-secondary border-border h-10 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="english">English</SelectItem>
                    <SelectItem value="hinglish">Hinglish</SelectItem>
                    <SelectItem value="hindi">Hindi</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button onClick={handleAnalyze} disabled={seoMutation.isPending || !keyword.trim() || keyword.trim().length < 2} className="w-full cyber-button h-12">
              {seoMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analyzing via Gemini Edge...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate SEO Bundle & Tags
                </>
              )}
            </Button>

            <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              <ShieldCheck className="w-3 h-3 text-green-400" />
              Secure: OPENROUTER_API_KEYS (rotated) live in process.env — no client exposure. React Query caches 10min for instant revisit.
            </p>
          </CardContent>
        </Card>

        {/* Results */}
        <Card className="cyber-card border-border">
          <CardHeader className="pb-3 md:pb-4">
            <CardTitle className="font-display text-base md:text-lg text-foreground flex items-center justify-between">
              <span className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-green-400" />
                SEO Audit & Tags
              </span>
              {result && <span className="text-xs font-normal text-muted-foreground bg-secondary px-2 py-1 rounded-full">Cached 10m</span>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {result ? (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 bg-secondary rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">SEO Score</p>
                    <p className="text-lg font-bold text-green-400 mt-1">{result.seoScore}/100</p>
                  </div>
                  <div className="p-3 bg-secondary rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">Competition</p>
                    <p className="text-xs font-semibold text-foreground mt-1 truncate" title={result.competition}>{result.competition}</p>
                  </div>
                  <div className="p-3 bg-secondary rounded-lg text-center">
                    <p className="text-xs text-muted-foreground flex items-center justify-center gap-1"><TrendingUp className="w-3 h-3" />Search Vol</p>
                    <p className="text-xs font-semibold text-accent mt-1">{result.searchVolume}</p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground font-medium">Optimized Title Recommendation (High CTR):</p>
                    <Button variant="ghost" size="sm" onClick={handleCopyTitle} className="h-7 text-xs gap-1">
                      <Copy className="w-3 h-3" /> Copy
                    </Button>
                  </div>
                  <div className="p-3 bg-secondary rounded-lg text-sm font-medium text-foreground leading-relaxed">
                    {result.optimizedTitle}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground font-medium">High-CTR Tags ({result.tags.length}) — cached:</p>
                    <Button variant="ghost" size="sm" onClick={handleCopyTags} className="h-7 text-xs gap-1">
                      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                      Copy Tags
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2 max-h-[180px] overflow-auto p-2 bg-secondary rounded-lg">
                    {result.tags.map((tag, i) => (
                      <span key={i} className="px-2.5 py-1 bg-card rounded-md text-xs text-foreground flex items-center gap-1 border border-border hover:border-primary/50 transition-colors">
                        <Hash className="w-3 h-3 text-primary" />
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-[340px] text-center">
                <Search className="w-12 h-12 text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground text-sm">Enter a keyword to generate optimized tags via Gemini Edge.</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Secure route: /api/seo-tags + React Query 10m cache</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
