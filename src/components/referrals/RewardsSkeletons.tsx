/**
 * Rewards route skeleton loaders.
 *
 * Lightweight placeholders that paint instantly while heavy referral
 * sub-components (leaderboard, streak, milestones, promo artifact) stream
 * in via React.lazy. Keeps the /rewards transition feeling instant.
 */

function SkeletonBar({ className = "" }: { className?: string }) {
  return <div className={`h-2 rounded bg-border/40 animate-pulse ${className}`} />;
}

export function RewardsShellSkeleton() {
  return (
    <div className="relative mx-auto max-w-6xl space-y-6 animate-pulse">
      <div className="h-10 w-2/3 rounded-md bg-secondary/40" />
      <div className="rounded-3xl glass-strong border-primary/20 p-8 space-y-4">
        <div className="h-8 w-1/2 rounded bg-secondary/40" />
        <div className="h-4 w-3/4 rounded bg-border/40" />
        <div className="h-4 w-2/3 rounded bg-border/40" />
      </div>
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3 space-y-4">
          <div className="rounded-2xl glass-strong border-primary/20 p-6 space-y-4">
            <div className="h-6 w-56 rounded bg-secondary/40" />
            <SkeletonBar className="w-1/2" />
            <SkeletonBar className="w-2/3" />
            <SkeletonBar className="w-1/3" />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="rounded-xl glass-strong border-border/50 p-4 h-40" />
            <div className="rounded-xl glass-strong border-border/50 p-4 h-40" />
          </div>
        </div>
        <div className="rounded-2xl glass-strong border-cyan-400/20 lg:col-span-2 p-6 h-[420px] space-y-3">
          <div className="h-6 w-48 rounded bg-secondary/40" />
          <SkeletonBar />
          <SkeletonBar className="w-3/4" />
          <div className="h-32 rounded-lg bg-secondary/30" />
        </div>
      </div>
    </div>
  );
}

export function RewardsPanelFallback() {
  return <div className="rounded-xl glass-strong border-border/50 p-4 min-h-[160px] animate-pulse bg-secondary/20" />;
}
