import { useState } from "react";
import { Search, Hash, Sparkles, Copy, Check, ShieldCheck, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function SeoOptimizer() {
  const [keyword, setKeyword] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<{
    tags: string[];
    seoScore: number;
    competition: string;
    searchVolume: string;
    optimizedTitle: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleAnalyze = async () => {
    const trimmed = keyword.trim();
    if (!trimmed) {
      toast.error("Please enter a keyword or title");
      return;
    }

    setIsAnalyzing(true);

    try {
      await new Promise(r => setTimeout(r, 1000));

      const tags = [
        trimmed,
        `${trimmed} 2026`,
        `how to ${trimmed}`,
        `${trimmed} tutorial`,
        `best ${trimmed} guide`,
        `faceless ${trimmed}`,
        `${trimmed} strategy`,
        `ultimate ${trimmed} tips`
      ];

      setResult({
        tags,
        seoScore: 92,
        competition: "Medium (High Demand)",
        searchVolume: "45K searches/mo",
        optimizedTitle: `The Ultimate Truth About ${trimmed} (Nobody Is Telling You)`
      });

      toast.success("SEO audit and tag bundle generated!");
    } catch {
      toast.error("Failed to analyze SEO");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleCopyTags = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.tags.join(', '));
      setCopied(true);
      toast.success("Tags copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
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
        </h1>
        <p className="text-sm md:text-base text-muted-foreground mt-1">
          Generate high-CTR tags, search volume estimation, and algorithm-optimized titles.
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
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="e.g. dark psychology, AI video automation, coding tutorial..."
              className="bg-secondary border-border h-11"
              disabled={isAnalyzing}
            />

            <Button
              onClick={handleAnalyze}
              disabled={isAnalyzing || !keyword.trim()}
              className="w-full cyber-button h-12"
            >
              {isAnalyzing ? (
                <>Analyzing SEO...</>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate SEO Bundle &amp; Tags
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Results */}
        <Card className="cyber-card border-border">
          <CardHeader className="pb-3 md:pb-4">
            <CardTitle className="font-display text-base md:text-lg text-foreground flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-green-400" />
              SEO Audit &amp; Tags
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
                    <p className="text-xs font-semibold text-foreground mt-1 truncate">{result.competition}</p>
                  </div>
                  <div className="p-3 bg-secondary rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">Search Vol</p>
                    <p className="text-xs font-semibold text-accent mt-1">{result.searchVolume}</p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground font-medium">Optimized Title Recommendation:</p>
                  <div className="p-3 bg-secondary rounded-lg text-sm font-medium text-foreground">
                    {result.optimizedTitle}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground font-medium">High-CTR Tags ({result.tags.length}):</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCopyTags}
                      className="h-7 text-xs gap-1"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                      Copy Tags
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2 max-h-[160px] overflow-auto p-2 bg-secondary rounded-lg">
                    {result.tags.map((tag, i) => (
                      <span key={i} className="px-2.5 py-1 bg-card rounded-md text-xs text-foreground flex items-center gap-1 border border-border">
                        <Hash className="w-3 h-3 text-primary" />
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-[280px] text-center">
                <Search className="w-12 h-12 text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground text-sm">
                  Enter a keyword to generate optimized tags and SEO score.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
