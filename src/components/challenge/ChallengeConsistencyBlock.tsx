import { Flame, Trophy } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ChallengeMilestones } from "./ChallengeMilestones";
import { ChallengeShareCard } from "./ChallengeShareCard";
import { useChallengeState } from "@/hooks/useEngineData";
import { engineConfigured } from "@/lib/engine/client";

/**
 * Rewards-page block: consistency stats + milestone shelf + share card.
 * All numbers server-authoritative from /api/challenge.
 */
export function ChallengeConsistencyBlock() {
  const challenge = useChallengeState(engineConfigured());
  if (!engineConfigured()) return null;
  const state = challenge.data;
  if (!state || state.status === "not_enrolled") return null;

  return (
    <Card className="glass-strong border-amber-400/30 bracket">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="font-display font-semibold flex items-center gap-2">
            {state.status === "completed" ? (
              <Trophy className="w-5 h-5 text-amber-400" />
            ) : (
              <Flame className="w-5 h-5 text-orange-400" />
            )}
            30-Day Viral Challenge
          </p>
          <span className="text-[9px] font-mono text-primary/60">
            {state.total_script_days ?? 0}/30 SCRIPT DAYS • BEST {state.best_streak ?? 0}
          </span>
        </div>
        <ChallengeMilestones milestones={state.milestones ?? []} totalScriptDays={state.total_script_days ?? 0} />
        <ChallengeShareCard state={state} />
      </CardContent>
    </Card>
  );
}
