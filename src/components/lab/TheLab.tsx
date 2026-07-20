/**
 * THE LAB — Zeigarnik Effect Retention Engine
 *
 * Psychological design:
 * - Progress bars at 68-94% (never 100% — the open loop creates tension)
 * - Features sound like unfair competitive advantages
 * - "Founding Member" insider status (cancellation = losing your seat)
 * - Waitlist counter with thousands (social proof + FOMO)
 * - Countdown to next drop (time pressure)
 * - The tease of a tease ("Something bigger is coming")
 *
 * All data is self-contained — no API calls. Pure psychological engineering.
 * Progress bars shift weekly via seeded random, creating illusion of active development.
 */
import { useState, useEffect, useMemo } from "react";
import {
  Lock,
  Clock,
  Users,
  Sparkles,
  Zap,
  Brain,
  Eye,
  Mic,
  Calendar,
  Shield,
  TrendingUp,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/useAuthStore";
import { toast } from "sonner";

// ── Week-seeded pseudo-random for stable but slowly shifting progress ──
function weekSeed(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const week = Math.floor(
    (now.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)
  );
  return week;
}

function seededProgress(base: number, variance: number): number {
  const seed = weekSeed();
  const shift = ((seed * 2654435761) >>> 0) % (variance * 2);
  return Math.min(96, Math.max(base - variance + shift, base - variance));
}

function waitlistCount(): number {
  // Grows ~50/week from a base of 2,847
  const weeks = weekSeed();
  return 2847 + weeks * 47;
}

// ── Countdown to next "drop" — always 3-7 days away ──
function nextDropDate(): Date {
  const now = new Date();
  const daysUntilDrop = 3 + (weekSeed() % 5);
  return new Date(now.getTime() + daysUntilDrop * 24 * 60 * 60 * 1000);
}

// ── Feature definitions — each is an unclosed psychological loop ──
interface LabFeature {
  id: string;
  name: string;
  tagline: string;
  description: string;
  icon: typeof Brain;
  baseProgress: number;
  variance: number;
  status: "internal-testing" | "early-access" | "coming-soon" | "stealth";
  statusLabel: string;
  gradient: string;
  glowColor: string;
  scarcityTag?: string;
}

const LAB_FEATURES: LabFeature[] = [
  {
    id: "viral-score",
    name: "Viral Score Predictor",
    tagline: "Know if a video will go viral BEFORE you make it.",
    description:
      "Neural network trained on 2.4M viral videos predicts your view count, CTR, and retention curve before you hit record. Early access limited to Founding Members.",
    icon: TrendingUp,
    baseProgress: 94,
    variance: 4,
    status: "early-access",
    statusLabel: "Early Access — Founding Members Only",
    gradient: "from-emerald-500 to-cyan-500",
    glowColor: "shadow-[0_0_30px_rgba(16,185,129,0.3)]",
    scarcityTag: "12 spots left",
  },
  {
    id: "script-dna",
    name: "Script DNA Extractor",
    tagline: "Decode the exact psychological formula of any viral video.",
    description:
      "Breaks down pacing, hook structure, emotional arcs, and retention triggers into a reusable DNA template. Paste any video → get its skeleton.",
    icon: Brain,
    baseProgress: 91,
    variance: 5,
    status: "internal-testing",
    statusLabel: "Internal Testing — Q3 Launch",
    gradient: "from-purple-500 to-pink-500",
    glowColor: "shadow-[0_0_30px_rgba(168,85,247,0.3)]",
  },
  {
    id: "upload-scheduler",
    name: "AI Upload Scheduler",
    tagline: "Reverse-engineer your competitors' exact posting schedule.",
    description:
      "Maps every competitor's upload pattern, audience timezone, and engagement windows. Tells you the exact minute to publish for maximum algorithmic push.",
    icon: Calendar,
    baseProgress: 87,
    variance: 6,
    status: "coming-soon",
    statusLabel: "Coming Soon — In Development",
    gradient: "from-blue-500 to-indigo-500",
    glowColor: "shadow-[0_0_30px_rgba(59,130,246,0.3)]",
  },
  {
    id: "voice-clone",
    name: "Neural Voice Clone",
    tagline: "Your voice. AI-powered. 30 seconds of audio.",
    description:
      "Clone your voice with 30 seconds of sample audio. Generate unlimited voiceovers that sound exactly like you — but with AI-perfect delivery, pacing, and emotion.",
    icon: Mic,
    baseProgress: 83,
    variance: 5,
    status: "coming-soon",
    statusLabel: "Coming Soon — Beta Next Month",
    gradient: "from-orange-500 to-red-500",
    glowColor: "shadow-[0_0_30px_rgba(249,115,22,0.3)]",
    scarcityTag: "Pro only",
  },
  {
    id: "algo-whisperer",
    name: "Algorithm Whisperer",
    tagline: "48-hour advance notice before YouTube pushes a topic.",
    description:
      "Monitors YouTube's internal trending signals, search velocity shifts, and recommendation engine patterns. Alerts you 48 hours before a topic explodes.",
    icon: Eye,
    baseProgress: 76,
    variance: 8,
    status: "stealth",
    statusLabel: "Stealth Mode — Classified",
    gradient: "from-red-500 to-rose-500",
    glowColor: "shadow-[0_0_30px_rgba(239,68,68,0.3)]",
  },
  {
    id: "thumb-autopilot",
    name: "Thumbnail A/B Autopilot",
    tagline: "Automated split-testing against your competitors' thumbnails.",
    description:
      "Generates 4 thumbnail variants, tests them against your competitors' CTR patterns using our neural model, and auto-selects the winner. Zero manual work.",
    icon: Zap,
    baseProgress: 68,
    variance: 7,
    status: "coming-soon",
    statusLabel: "Coming Soon — Q4 Launch",
    gradient: "from-yellow-500 to-amber-500",
    glowColor: "shadow-[0_0_30px_rgba(234,179,8,0.3)]",
  },
];

// ── Countdown Hook ──
function useCountdown(target: Date) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, target.getTime() - Date.now())
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining(Math.max(0, target.getTime() - Date.now()));
    }, 1000);
    return () => clearInterval(interval);
  }, [target]);

  const days = Math.floor(remaining / (24 * 60 * 60 * 1000));
  const hours = Math.floor(
    (remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000)
  );
  const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
  const seconds = Math.floor((remaining % (60 * 1000)) / 1000);

  return { days, hours, minutes, seconds, total: remaining };
}

// ── Progress Bar Component ──
function LabProgressBar({
  progress,
  gradient,
  glowColor,
}: {
  progress: number;
  gradient: string;
  glowColor: string;
}) {
  return (
    <div className="relative">
      <div className="h-2.5 bg-secondary/80 rounded-full overflow-hidden border border-border/40">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-[2000ms] ease-out bg-gradient-to-r",
            gradient,
            glowColor
          )}
          style={{ width: `${progress}%` }}
        />
      </div>
      {/* The "not yet" indicator — always slightly before the end */}
      <div
        className="absolute top-0 h-2.5 w-px bg-foreground/40"
        style={{ left: `${progress}%` }}
      />
    </div>
  );
}

// ── Single Feature Card ──
function LabFeatureCard({ feature }: { feature: LabFeature }) {
  const progress = useMemo(
    () => seededProgress(feature.baseProgress, feature.variance),
    [feature.baseProgress, feature.variance]
  );

  const Icon = feature.icon;

  const statusStyles = {
    "internal-testing": "bg-amber-500/15 text-amber-400 border-amber-500/30",
    "early-access": "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    "coming-soon": "bg-blue-500/15 text-blue-400 border-blue-500/30",
    stealth: "bg-red-500/15 text-red-400 border-red-500/30",
  };

  return (
    <div
      className={cn(
        "group relative rounded-2xl border border-border/60 bg-card/60 backdrop-blur-sm p-4 md:p-5",
        "transition-all duration-500 hover:border-primary/40 hover:bg-card/80",
        feature.glowColor,
        "hover:shadow-lg"
      )}
    >
      {/* Classified overlay for stealth features */}
      {feature.status === "stealth" && (
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-red-500/5 to-transparent pointer-events-none" />
      )}

      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "w-10 h-10 md:w-11 md:h-11 rounded-xl flex items-center justify-center shrink-0",
                "bg-gradient-to-br",
                feature.gradient
              )}
            >
              <Icon className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h3 className="font-display font-bold text-sm md:text-base text-foreground leading-tight">
                {feature.name}
              </h3>
              <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">
                {feature.tagline}
              </p>
            </div>
          </div>

          {/* Status badge */}
          <Badge
            variant="outline"
            className={cn(
              "text-[9px] font-mono font-bold shrink-0 border",
              statusStyles[feature.status]
            )}
          >
            {feature.status === "stealth" && (
              <Lock className="w-2.5 h-2.5 mr-1" />
            )}
            {feature.statusLabel}
          </Badge>
        </div>

        {/* Description */}
        <p className="text-[11px] text-muted-foreground leading-relaxed mb-4 line-clamp-2">
          {feature.description}
        </p>

        {/* Progress bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-foreground/70">
              Development Progress
            </span>
            <span
              className={cn(
                "text-[11px] font-mono font-bold",
                progress >= 90
                  ? "text-emerald-400"
                  : progress >= 80
                  ? "text-cyan-400"
                  : "text-amber-400"
              )}
            >
              {progress}%
            </span>
          </div>
          <LabProgressBar
            progress={progress}
            gradient={feature.gradient}
            glowColor={feature.glowColor}
          />
        </div>

        {/* Scarcity tag */}
        {feature.scarcityTag && (
          <div className="mt-3 flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
            <span className="text-[10px] font-bold text-red-400 font-display">
              {feature.scarcityTag}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Lab Section ──
export function TheLab() {
  const license = useAuthStore((s) => s.license);
  const isPro = license.tier === "pro" || license.tier === "enterprise";
  const [isExpanded, setIsExpanded] = useState(false);

  const dropDate = useMemo(() => nextDropDate(), []);
  const countdown = useCountdown(dropDate);
  const waitlist = useMemo(() => waitlistCount(), []);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600 flex items-center justify-center shadow-[0_0_20px_rgba(139,92,246,0.4)]">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-500 border-2 border-background animate-pulse" />
          </div>
          <div>
            <h2 className="font-display text-lg md:text-xl font-bold text-foreground flex items-center gap-2">
              The Lab
              <span className="px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/25 font-display text-[9px] uppercase tracking-widest font-bold">
                Classified
              </span>
            </h2>
            <p className="text-[11px] text-muted-foreground">
              What we're building next. Founding Members get first access.
            </p>
          </div>
        </div>

        {/* Founding Member badge or waitlist */}
        <div className="hidden md:flex items-center gap-3">
          {isPro ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-amber-500/15 to-orange-500/15 border border-amber-500/25">
              <Shield className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[10px] font-display font-bold text-amber-400">
                Founding Member — Early Access Active
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary border border-border">
              <Users className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[10px] font-mono text-muted-foreground">
                {waitlist.toLocaleString()} on waitlist
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Countdown to Next Drop */}
      <Card className="cyber-card border-violet-500/20 bg-gradient-to-r from-violet-500/5 via-card to-fuchsia-500/5">
        <CardContent className="p-4 md:p-5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="space-y-1">
              <p className="text-[10px] text-violet-400 font-mono uppercase tracking-widest font-bold flex items-center gap-1.5">
                <Clock className="w-3 h-3" />
                Next Feature Drop
              </p>
              <p className="text-sm md:text-base font-display font-bold text-foreground">
                {isPro
                  ? "You're first in line. The next drop lands in your account automatically."
                  : "Pro members get instant access. Everyone else waits."}
              </p>
            </div>

            {/* Countdown timer */}
            <div className="flex items-center gap-2">
              {[
                { value: countdown.days, label: "D" },
                { value: countdown.hours, label: "H" },
                { value: countdown.minutes, label: "M" },
                { value: countdown.seconds, label: "S" },
              ].map((unit, i) => (
                <div
                  key={i}
                  className="flex flex-col items-center bg-black/40 rounded-lg px-3 py-2 border border-violet-500/20"
                >
                  <span className="text-lg md:text-xl font-mono font-bold text-violet-400 tabular-nums">
                    {String(unit.value).padStart(2, "0")}
                  </span>
                  <span className="text-[8px] text-muted-foreground uppercase">
                    {unit.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Feature Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        {LAB_FEATURES.slice(0, isExpanded ? undefined : 3).map((feature) => (
          <LabFeatureCard key={feature.id} feature={feature} />
        ))}
      </div>

      {/* Expand/Collapse — reveals more features, increasing the open loops */}
      {!isExpanded && (
        <button
          onClick={() => setIsExpanded(true)}
          className="w-full p-3 rounded-xl border border-dashed border-violet-500/30 bg-violet-500/5 hover:bg-violet-500/10 transition-all group flex items-center justify-center gap-2 cursor-pointer"
        >
          <Lock className="w-3.5 h-3.5 text-violet-400 group-hover:animate-pulse" />
          <span className="text-xs font-display font-bold text-violet-400">
            3 more classified projects hidden — tap to reveal
          </span>
          <ChevronRight className="w-3.5 h-3.5 text-violet-400" />
        </button>
      )}

      {/* The Tease of a Tease — the ultimate unclosed loop */}
      <Card className="cyber-card border-dashed border-amber-500/20 bg-gradient-to-r from-amber-500/5 to-transparent">
        <CardContent className="p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-400 animate-pulse" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-display font-bold text-amber-400">
              🤫 Something else is coming. We can't talk about it yet.
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Our engineering team is working on a feature that will fundamentally
              change how YouTube creators operate. Founding Members will be the
              first to know.{" "}
              {isPro ? (
                <span className="text-amber-400 font-semibold">
                  You're on the list.
                </span>
              ) : (
                <span className="text-red-400 font-semibold">
                  Upgrade to Pro to guarantee your spot.
                </span>
              )}
            </p>
          </div>
          {!isPro && (
            <Button
              size="sm"
              className="cyber-button text-[10px] h-8 px-3 font-display shrink-0"
              onClick={() => {
                useAuthStore.getState().setUpgradeModalOpen(true);
              }}
            >
              <Zap className="w-3 h-3 text-primary-foreground fill-primary-foreground" />
              Upgrade
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
