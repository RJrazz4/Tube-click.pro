/**
 * Phase G2 — Truncation banner: the upsell moment, honestly framed.
 *
 * Rendered only when the plan's engine truncated the storyboard
 * (response.truncated). The CTA opens the existing payment URL from the
 * monetization locker — copy comes from the unit-locked view-model.
 */
import { Crown } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getLockerUrl } from "@/lib/monetization/locker";
import { toTruncationBanner } from "@/lib/orchestrator/truncation-banner-view";
import type { OrchestratorStoryboardResponse } from "@/lib/orchestrator/types";

export function TruncationBanner({ body }: { body: OrchestratorStoryboardResponse }) {
  const view = toTruncationBanner(body);
  if (view === null) return null;

  return (
    <Card className="border-amber-500/40 bg-amber-500/10">
      <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
        <div className="flex items-start gap-3">
          <Crown className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium text-amber-200">{view.title}</p>
            <p className="text-sm text-muted-foreground">{view.message}</p>
          </div>
        </div>
        {view.ctaLabel !== null && (
          <Button
            variant="outline"
            className="border-amber-500/50 text-amber-200 hover:bg-amber-500/10"
            onClick={() => window.open(getLockerUrl(), "_blank", "noopener,noreferrer")}
          >
            <Crown className="h-4 w-4" />
            {view.ctaLabel}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
