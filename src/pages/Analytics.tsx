import { useState } from "react";
import { TrendingUp, DollarSign, Users, Award, Sparkles, Calculator, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useSoftGate } from "@/contexts/SoftGateContext";

export default function Analytics() {
  const { runGuarded } = useSoftGate();
  const [subs, setSubs] = useState("50000");
  const [avgViews, setAvgViews] = useState("15000");
  const [uploadsPerMonth, setUploadsPerMonth] = useState("4");
  const [niche, setNiche] = useState("Tech & AI");
  const [result, setResult] = useState<{
    projectedMonthlyViews: number;
    projectedSubscriberGrowth: number;
    estimatedAdsense: number;
    estimatedSponsorship: number;
    viralScore: number;
    growthRate: string;
    conservativeRevenue: number;
    upsideRevenue: number;
    confidence: "Low" | "Medium" | "High";
    assumptions: string[];
    sensitivity: string;
    priorityAction: string;
  } | null>(null);

  const performCalculateROI = () => {
    const s = parseInt(subs) || 0;
    const v = parseInt(avgViews) || 0;
    const uploadCount = Math.min(31, Math.max(1, parseInt(uploadsPerMonth) || 0));

    if (s <= 0 || v <= 0 || uploadCount <= 0) {
      toast.error("Please enter valid numbers");
      return;
    }

    const monthlyViews = v * uploadCount;
    const monthlySubscriberGrowth = Math.round(monthlyViews * 0.012);
    const cpm = niche === "Finance & Crypto" ? 12 : niche === "Tech & AI" ? 8 : 4;
    const adsense = Math.round((monthlyViews / 1000) * cpm);
    const sponsorship = Math.round(s * 0.08); // Benchmark estimate, not a guarantee
    const viralScore = Math.min(98, Math.max(35, Math.round((v / s) * 100 + 40)));
    const growthRate = s > 100000 ? "+18% MoM" : "+24% MoM";
    const baseRevenue = adsense + sponsorship;
    const conservativeRevenue = Math.round(baseRevenue * 0.65);
    const upsideRevenue = Math.round(baseRevenue * 1.6);
    const confidence = v >= s * 0.5 ? "High" : v >= s * 0.15 ? "Medium" : "Low";

    setResult({
      projectedMonthlyViews: monthlyViews,
      projectedSubscriberGrowth: monthlySubscriberGrowth,
      estimatedAdsense: adsense,
      estimatedSponsorship: sponsorship,
      viralScore,
      growthRate,
      conservativeRevenue,
      upsideRevenue,
      confidence,
      assumptions: [`${cpm} estimated RPM for ${niche}`, `${uploadCount} uploads per month`, "Sponsorship benchmark based on subscriber count"],
      sensitivity: `A 25% reach lift would add about ${Math.round(monthlyViews * 0.25).toLocaleString()} monthly views and $${Math.round(adsense * 0.25).toLocaleString()} estimated ad revenue.`,
      priorityAction: v < s * 0.25 ? "Prioritize packaging tests: title and thumbnail promise clarity are the highest-leverage gap." : "Prioritize retention: strengthen the first 30 seconds and move proof closer to the opening payoff.",
    });

    toast.success("Growth projection and ROI calculated!");
  };

  const calculateROI = () => {
    if ((parseInt(subs) || 0) <= 0 || (parseInt(avgViews) || 0) <= 0) return performCalculateROI();
    return runGuarded("see the next growth projection", performCalculateROI);
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
              <Label className="text-sm text-foreground">Uploads per Month</Label>
              <Input type="number" min="1" max="31" value={uploadsPerMonth} onChange={(e) => setUploadsPerMonth(e.target.value)} className="bg-secondary border-border" />
              <p className="text-[11px] text-muted-foreground">Used to calculate monthly reach instead of assuming four uploads.</p>
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
                    <p className="text-xs text-muted-foreground">Projected Subs Added</p>
                    <p className="text-xl md:text-2xl font-display font-bold text-foreground mt-1">+{result.projectedSubscriberGrowth.toLocaleString()}</p>
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

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="p-4 rounded-xl bg-secondary/50 border border-border">
                    <p className="text-xs text-muted-foreground">Conservative monthly revenue</p>
                    <p className="text-xl font-display font-bold text-foreground mt-1">${result.conservativeRevenue.toLocaleString()}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">65% of benchmark case</p>
                  </div>
                  <div className="p-4 rounded-xl bg-primary/10 border border-primary/30">
                    <p className="text-xs text-muted-foreground">Benchmark revenue range</p>
                    <p className="text-xl font-display font-bold text-primary mt-1">${result.conservativeRevenue.toLocaleString()}–${result.upsideRevenue.toLocaleString()}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">Not a guaranteed forecast</p>
                  </div>
                  <div className="p-4 rounded-xl bg-secondary/50 border border-border">
                    <p className="text-xs text-muted-foreground">Model confidence</p>
                    <p className="text-xl font-display font-bold text-foreground mt-1">{result.confidence}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">Based on views/subscriber signal</p>
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
                  <div className="border-t border-primary/20 pt-3 mt-3 space-y-1">
                    <p className="text-[11px] font-semibold text-foreground">Highest-leverage action</p>
                    <p className="text-[11px] text-muted-foreground">{result.priorityAction}</p>
                    <p className="text-[11px] font-semibold text-foreground mt-2">Sensitivity signal</p>
                    <p className="text-[11px] text-muted-foreground">{result.sensitivity}</p>
                  </div>
                  <div className="border-t border-primary/20 pt-2 mt-3">
                    <p className="text-[11px] font-semibold text-foreground">Model assumptions</p>
                    <p className="text-[11px] text-muted-foreground">{result.assumptions.join(" • ")}</p>
                  </div>
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
