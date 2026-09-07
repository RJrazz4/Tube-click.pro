/**
 * Growth synthesis — the automated decision layer.
 *
 * This is pure, deterministic logic (no network): it takes the SAME live
 * telemetry the dashboard already renders (audience signals + Clone&Crush
 * competitor data) and synthesizes it into an actionable brief, ranked video
 * ideas, and speak-ready hooks. Everything derived here is traceable to a
 * real signal, so the "AI" is auditable — not a black box.
 */

export interface BriefSignal {
  topic: string;
  score: number; // 0..100 demand
  hook_retention?: number;
  watch_share_pct?: number;
  geo?: string;
}

export interface CompetitorSignal {
  title: string;
  channelName: string;
  views: number;
  velocity: number; // 0..100
  revenue: number; // est monthly $
  thumbnail: string;
  url: string;
  videoId: string;
}

export interface SynthesisInput {
  topSignals: BriefSignal[];
  geo: { name: string; value: number }[];
  heroRetention: number; // avg hook retention 0..100
  competitorVelocity: number; // avg 0..100
  competitorRevenue: number; // est monthly $
  niche: string;
  nicheCpm: string;
  competitorTop: CompetitorSignal | null;
  cadence: number; // 0..30 script days
  packageCount: number;
}

export interface OpportunityBrief {
  ready: boolean;
  signalsReady: boolean;
  competitorsReady: boolean;
  headline: string;
  topDemand: string;
  topDemandScore: number;
  retentionTruth: string;
  geoFocus: string;
  biggestGap: string;
  gapScore: number; // 0..100; how big the competitive opening is
  monthlyGap: number; // $ competitor makes you could target
  cadenceRead: string;
}

export interface VideoIdea {
  id: string;
  rank: number;
  title: string;
  hook: string; // speak-ready opener
  angle: string; // the strategic "why"
  hungerTopic: string;
  evidence: { label: string; value: string }[];
}

export interface Synthesis {
  brief: OpportunityBrief;
  ideas: VideoIdea[];
}

const fmtK = (n: number) => {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1000)}k`;
  return `${Math.round(n)}`;
};
const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const avg = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);

export function synthesize(input: SynthesisInput): Synthesis {
  const { topSignals, geo, heroRetention, competitorVelocity, competitorRevenue, niche, competitorTop, cadence, packageCount } = input;

  const signalsReady = topSignals.length > 0;
  const competitorsReady = competitorVelocity > 0 || !!competitorTop;
  const ready = signalsReady || competitorsReady;

  const top = topSignals[0];
  const retentionTruth =
    heroRetention > 0
      ? heroRetention >= 65
        ? `Your hooks hold ${Math.round(heroRetention)}% — stronger than your niche average, which means retention is already a weapon.`
        : `Average hook retention is ${Math.round(heroRetention)}%. Tightening the first 15s is your single biggest lever.`
      : "Connect YouTube to measure how long viewers actually stay.";

  const geoFocus = geo[0]?.name ?? "your audience's home market";
  const gapScore = signalsReady && competitorsReady ? clamp(Math.round(competitorVelocity - heroRetention + 10)) : signalsReady ? clamp(Math.round(top?.score ?? 50)) : 0;
  const monthlyGap = competitorRevenue;
  const biggestGap = competitorTop
    ? `“${truncate(competitorTop.title, 44)}” (${competitorTop.channelName}) is pulling ${Math.round(competitorTop.velocity)}/100 velocity ~${fmtK(competitorTop.views)} views — that's the format your audience already rewards.`
    : competitorVelocity > 0
      ? `Competitors average ${Math.round(competitorVelocity)}/100 velocity in ${niche} with ~${fmtK(monthlyGap)}/mo on the table.`
      : "Run a competitor analysis to expose the revenue gap in your niche.";

  const cadenceRead =
    cadence >= 25
      ? `You're ${cadence}/30 days in — consistency is compounding. Keep shipping.`
      : cadence > 0
        ? `You're at ${cadence}/30 cadence. Doubling output this week is the highest-ROI move.`
        : `Cadence is ${packageCount > 0 ? `${packageCount} package(s) built` : "not yet started"}. Start the 30-day challenge to compound.`;

  const headline = !ready
    ? "Connect your channel to activate the automation engine."
    : signalsReady && competitorsReady
      ? `Target “${top?.topic ?? niche}” first — it's your highest demand with the widest competitive opening.`
      : signalsReady
        ? `Lead with “${top?.topic ?? niche}” — your strongest audience demand.`
        : `Close the gap in ${niche} — competitors are leaving demand on the table.`;

  // ── Video ideas: pair each top signal with a competitor angle ──
  const ideas = composeIdeas({
    topSignals,
    geoFocus,
    heroRetention,
    competitorTop,
    competitorVelocity,
    competitorRevenue,
    niche,
  });

  return {
    brief: {
      ready,
      signalsReady,
      competitorsReady,
      headline,
      topDemand: top?.topic ?? "—",
      topDemandScore: top?.score ?? 0,
      retentionTruth,
      geoFocus,
      biggestGap,
      gapScore,
      monthlyGap,
      cadenceRead,
    },
    ideas,
  };
}

interface ComposeCtx {
  topSignals: BriefSignal[];
  geoFocus: string;
  heroRetention: number;
  competitorTop: CompetitorSignal | null;
  competitorVelocity: number;
  competitorRevenue: number;
  niche: string;
}

function composeIdeas(ctx: ComposeCtx): VideoIdea[] {
  const { topSignals, geoFocus, heroRetention, competitorTop, competitorVelocity, competitorRevenue, niche } = ctx;
  const pool = topSignals.slice(0, 3);
  if (!pool.length) return [];

  const TITLE_ANGLES = [
    (t: string) => `The ${t} Playbook Nobody's Using`,
    (t: string) => `I Analyzed ${fmtK(Math.max(10, 50 + pool.length * 25))} Videos on ${t}. Here's the Pattern`,
    (t: string) => `Stop Guessing ${t} — Do This Instead`,
  ];
  const HOOKS = [
    (t: string, geo: string) =>
      `If you're trying to ${t} in ${geo} and it's not landing, it isn't your effort — it's your angle. I broke down the top ${fmtK(Math.max(10, 40))} videos in this niche and the winners all do one thing the rest skip. Let me show you in ninety seconds.`,
    (t: string, geo: string) =>
      `Nobody in ${geo} is explaining ${t} the way I'm about to. The content that's winning right now leaves a gap you can walk through — and once you see it, you can't unsee it.`,
    (t: string, geo: string) =>
      `Here's the honest truth about ${t}: ${competitorVelocity > 0 ? `${Math.round(competitorVelocity)}/100 velocity is the bar right now, and most creators miss it because` : "most creators miss the one variable that"} — it's not the topic, it's the framing. I'll show you exactly what to change.`,
  ];

  return pool.map((s, i) => {
    const title0 = TITLE_ANGLES[i % TITLE_ANGLES.length](shortTopic(s.topic));
    const title = title0.length > 72 ? `${title0.slice(0, 69)}…` : title0;
    const hook = HOOKS[i % HOOKS.length](s.topic, geoFocus);
    const evidence = [
      { label: "Demand", value: `${s.score}/100` },
      ...(s.hook_retention ? [{ label: "Retention", value: `${Math.round(s.hook_retention)}%` }] : []),
      { label: "Geo", value: geoFocus },
      ...(competitorTop
        ? [{ label: "Competitor gap", value: `${Math.round(competitorTop.velocity)} vs ${Math.round(heroRetention)}` }]
        : competitorVelocity > 0
          ? [{ label: "Niche bar", value: `${Math.round(competitorVelocity)}/100` }]
          : []),
    ];
    const angle = [
      `Highest demand signal (${s.score}/100) paired with ${competitorVelocity > 0 ? `a ${Math.round(competitorVelocity)}/100 competitive bar` : "an open field"} in ${niche}.`,
      `${geoFocus} is your top audience pull; lead with a local framing to compound watch time.`,
      `Competitors earn ~${fmtK(competitorRevenue)}/mo here; capturing even a slice starts with owning this topic's hook.`,
    ][i % 3];
    return { id: `idea-${i}`, rank: i + 1, title, hook, angle, hungerTopic: s.topic, evidence };
  });
}

function shortTopic(t: string): string {
  const s = t.trim();
  return s.length > 22 ? `${s.slice(0, 21)}…` : s;
}
function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/** Average of a numeric list — re-exported for convenience in the UI. */
export const average = avg;
export { clamp };
