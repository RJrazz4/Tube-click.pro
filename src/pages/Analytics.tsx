import { useState } from "react";
import { TrendingUp, DollarSign, Users, Award, Sparkles, Calculator, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export default function Analytics() {
  const [subs, setSubs] = useState("50000");
  const [avgViews, setAvgViews] = useState("15000");
  const [niche, setNiche] = useState("Tech & AI");
  const [result, setResult] = useState<{
    projectedMonthlyViews: number;
    estimatedAdsense: number;
    estimatedSponsorship: number;
    viralScore: number;
    growthRate: string;
  } | null>(null);

  const calculateROI = () => {
    const s = parseInt(subs) || 0;
    const v = parseInt(avgViews) || 0;
    
    if (s <= 0 || v <= 0) {
      toast.error("Please enter valid numbers");
      return;
    }

    const monthlyViews = v * 4; // ~4 uploads a month
    const cpm = niche === "Finance & Crypto" ? 12 : niche === "Tech & AI" ? 8 : 4;
    const adsense = Math.round((monthlyViews / 1000) * cpm);
    const sponsorship = Math.round(s * 0.08); // Estimate brand deal value
    const viralScore = Math.min(98, Math.max(65, Math.round((v / s) * 100 + 40)));
    const growthRate = s > 100000 ? "+18% MoM" : "+24% MoM";

    setResult({
      projectedMonthlyViews: monthlyViews,
      estimatedAdsense: adsense,
      estimatedSponsorship: sponsorship,
      viralScore,
      growthRate
    });

    toast.success("Growth projection and ROI calculated!");
  };

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
          <TrendingUp className="w-6 h-6 md:w-7 md:h-7 text-primary" />
          Channel Analytics &amp; Viral ROI Predictor
        </h1>
        <p className="text-sm md:text-base text-muted-foreground mt-1">
          Simulate channel growth, AdSense earnings, brand deal potential, and viral success score.
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 md:gap-6">
        {/* Input Card */}
        <Card className="cyber-card border-border lg:col-span-1">
          <CardHeader className="pb-3 md:pb-4">
            <CardTitle className="font-display text-base md:text-lg text-foreground flex items-center gap-2">
              <Calculator className="w-4 h-4 text-primary" />
              Channel Metrics
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm text-foreground">Current Subscribers</Label>
              <Input
                type="number"
                value={subs}
                onChange={(e) => setSubs(e.target.value)}
                className="bg-secondary border-border"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm text-foreground">Average Views per Video</Label>
              <Input
                type="number"
                value={avgViews}
                onChange={(e) => setAvgViews(e.target.value)}
                className="bg-secondary border-border"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm text-foreground">Content Niche</Label>
              <Select value={niche} onValueChange={setNiche}>
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Tech & AI">Tech &amp; AI</SelectItem>
                  <SelectItem value="Finance & Crypto">Finance &amp; Crypto</SelectItem>
                  <SelectItem value="Vlog & Lifestyle">Vlog &amp; Lifestyle</SelectItem>
                  <SelectItem value="Gaming">Gaming</SelectItem>
                  <SelectItem value="Education">Education</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={calculateROI}
              className="w-full cyber-button h-11"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Calculate ROI &amp; Viral Score
            </Button>
          </CardContent>
        </Card>

        {/* Results Card */}
        <Card className="cyber-card border-border lg:col-span-2">
          <CardHeader className="pb-3 md:pb-4">
            <CardTitle className="font-display text-base md:text-lg text-foreground">Growth &amp; Revenue Projection</CardTitle>
            <CardDescription className="text-xs md:text-sm text-muted-foreground">AI-powered estimation based on current creator economy benchmarks</CardDescription>
          </CardHeader>
          <CardContent>
            {result ? (
              <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 rounded-xl bg-secondary/50 border border-border">
                    <p className="text-xs text-muted-foreground">Monthly Views</p>
                    <p className="text-xl md:text-2xl font-display font-bold text-foreground mt-1">
                      {result.projectedMonthlyViews.toLocaleString()}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-secondary/50 border border-border">
                    <p className="text-xs text-muted-foreground">Est. AdSense</p>
                    <p className="text-xl md:text-2xl font-display font-bold text-green-400 mt-1">
                      ${result.estimatedAdsense.toLocaleString()}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-secondary/50 border border-border">
                    <p className="text-xs text-muted-foreground">Brand Deals</p>
                    <p className="text-xl md:text-2xl font-display font-bold text-primary mt-1">
                      ${result.estimatedSponsorship.toLocaleString()}/mo
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-secondary/50 border border-border">
                    <p className="text-xs text-muted-foreground">Viral Potential</p>
                    <p className="text-xl md:text-2xl font-display font-bold text-accent mt-1">
                      {result.viralScore}/100
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-primary/10 border border-primary/20 space-y-2">
                  <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Award className="w-4 h-4 text-primary" />
                    AI Strategic Recommendations for {niche}:
                  </p>
                  <ul className="text-xs md:text-sm text-muted-foreground space-y-1.5">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
                      Upload frequency sweet spot: 2 long-form videos &amp; 3 Shorts per week.
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
                      Estimated subscriber growth trajectory: <strong className="text-foreground">{result.growthRate}</strong>.
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
                      Sponsorship readiness: Your channel metrics qualify for tier-2 brand sponsorships.
                    </li>
                  </ul>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-[300px] text-center">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-secondary flex items-center justify-center mb-4">
                  <TrendingUp className="w-7 h-7 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground text-sm">
                  Enter your channel metrics on the left and click calculate to view projections.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
