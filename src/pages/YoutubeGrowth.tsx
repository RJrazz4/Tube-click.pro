import { useState } from "react";
import {
  Rocket,
  Target,
  CalendarDays,
  Trophy,
  TrendingUp,
  CheckCircle2,
  Sparkles,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useSoftGate } from "@/contexts/SoftGateContext";

type PlaybookItem = {
  step: string;
  title: string;
  detail: string;
  metric: string;
};

const PLAYBOOK: PlaybookItem[] = [
  { step: "01", title: "Lock your niche audience", detail: "Pick one audience hunger and own it. Every other step compounds on a clear niche.", metric: "Audience Pull > 40%" },
  { step: "02", title: "Reverse-engineer the winner", detail: "Clone the hook + format of a video already winning your hunger topic.", metric: "Hook retention x2" },
  { step: "03", title: "Ship scripts on a cadence", detail: "Consistency beats intensity. Protect a publishing schedule your audience can rely on.", metric: "Views Velocity up" },
  { step: "04", title: "Package for every platform", detail: "Repurpose one script into shorts, posts and carousels to multiply reach per unit of work.", metric: "Reach multi x4" },
  { step: "05", title: "Read your signals weekly", detail: "Review momentum, geo pull and velocity. Double down where the data says to.", metric: "Signal Momentum" },
];

const ROADMAP = [
  { phase: "Foundation", weeks: "Weeks 1–2", items: ["Set niche & audience hunger", "Build 3 pro scripts", "Update titles & tags"] },
  { phase: "Momentum", weeks: "Weeks 3–4", items: ["Publish on cadence", "Repurpose to shorts/posts", "Track views velocity"] },
  { phase: "Scaling", weeks: "Weeks 5–6", items: ["Double down on top signals", "Test earned-revenue models", "Harden your library"] },
];

export default function YoutubeGrowth() {
  const { runGuarded } = useSoftGate();
  const [roadmap, setRoadmap] = useState<number>(0);

  const enroll = () =>
    void runGuarded("start your advanced growth roadmap", async () => {
      toast.success("Growth roadmap activated — your 6-week sprint is ready.");
      setRoadmap(1);
    });

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Hero */}
      <Card className="glass-strong bracket border-primary/20 relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-red-500/10 via-transparent to-cyan-400/10" />
        <CardContent className="relative flex flex-col gap-4 p-5 md:p-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2">
              <Rocket className="h-5 w-5 text-primary" />
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-primary">Advanced YouTube growth engine</span>
            </div>
            <h1 className="mt-2 font-display text-2xl md:text-3xl font-black text-foreground">
              Grow on purpose, not on luck.
            </h1>
            <p className="mt-2 text-sm md:text-base text-muted-foreground leading-relaxed">
              A structured playbook that turns your channel's live signals into a compounding growth plan —
              niche, clone, ship, repurpose, and scale systematically.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button className="cyber-button gap-2 text-xs font-display" onClick={enroll}>
              <Sparkles className="h-4 w-4 fill-primary-foreground" /> Activate my roadmap
            </Button>
            <Button asChild variant="outline" className="gap-2 text-xs">
              <Link to="/analytics"><TrendingUp className="h-4 w-4" /> Project growth</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 5-step playbook */}
      <section aria-labelledby="playbook-heading" className="space-y-3">
        <div>
          <h2 id="playbook-heading" className="font-display text-lg md:text-xl font-semibold text-foreground flex items-center gap-2">
            <Target className="h-5 w-5 text-cyan-300" /> The Growth Playbook
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">Five compounding steps, each tied to a live metric you can watch in your Command Center.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
          {PLAYBOOK.map((p) => (
            <Card key={p.step} className="cyber-card border-border/60 hover:border-primary/40 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] text-muted-foreground/60">STEP {p.step}</span>
                  <CheckCircle2 className="h-4 w-4 text-emerald-500/70" />
                </div>
                <p className="mt-2 text-sm font-display font-semibold text-foreground leading-tight">{p.title}</p>
                <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">{p.detail}</p>
                <p className="mt-2 inline-flex items-center gap-1 rounded-md border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[9px] font-mono text-primary">{p.metric}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Roadmap */}
      <section aria-labelledby="roadmap-heading" className="space-y-3">
        <div>
          <h2 id="roadmap-heading" className="font-display text-lg md:text-xl font-semibold text-foreground flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-fuchsia-300" /> Your 6-Week Sprint
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">A phased sequence that keeps every week measurable.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {ROADMAP.map((phase, i) => {
            const active = roadmap > 0;
            return (
              <Card key={phase.phase} className={i === 0 ? "border-primary/30 bg-primary/5" : "border-border/60"}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="font-display text-base flex items-center gap-2">
                      {i === 2 ? <Trophy className="h-4 w-4 text-amber-400" /> : <Sparkles className="h-4 w-4 text-primary" />}
                      {phase.phase}
                    </CardTitle>
                    <Badge variant="outline" className="text-[9px] font-mono text-muted-foreground">{phase.weeks}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-1.5">
                  {phase.items.map((item) => (
                    <p key={item} className="flex items-start gap-2 text-xs text-foreground">
                      <span className={active ? "text-emerald-400" : "text-primary/60"}><CheckCircle2 className="h-3.5 w-3.5 mt-0.5" /></span>
                      <span className={cnLabel(active)}>{item}</span>
                    </p>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
        {roadmap > 0 ? (
          <p className="flex items-center gap-2 text-xs font-mono text-emerald-400"><CheckCircle2 className="h-4 w-4" /> Roadmap active — start Phase 1 and ship your first script today.</p>
        ) : (
          <p className="flex items-center gap-2 text-xs font-mono text-muted-foreground"><AlertTriangle className="h-4 w-4" /> Activate the roadmap above to unlock the phased checklist.</p>
        )}
      </section>

      {/* CTA */}
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-6 text-center">
        <Rocket className="h-8 w-8 text-primary" />
        <p className="text-sm font-display font-semibold text-foreground">Growth is a system, not a sprint of luck.</p>
        <p className="max-w-md text-xs text-muted-foreground">Revisit your Command Center alerts and take one action per week. The compounding is the strategy.</p>
        <Button asChild className="cyber-button gap-2 text-xs font-display h-10">
          <Link to="/clone-crush">Analyze a winning video <ArrowRight className="h-4 w-4" /></Link>
        </Button>
      </div>
    </div>
  );
}

function cnLabel(on: boolean): string {
  return on ? "text-emerald-200/90" : "text-foreground/80";
}
