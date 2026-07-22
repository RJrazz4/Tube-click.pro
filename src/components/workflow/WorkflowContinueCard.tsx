import { ArrowRight, Clapperboard, FileText, Mic, RotateCcw, Share2, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { useWorkflowStore, type WorkflowDestination } from "@/stores/useWorkflowStore";

const DESTINATION = {
  voice: { label: "Continue in Voiceover", route: "/voice", icon: Mic },
  repurposer: { label: "Continue in Repurposer", route: "/repurposer", icon: Share2 },
} satisfies Record<WorkflowDestination, { label: string; route: string; icon: typeof Mic }>;

export function WorkflowContinueCard() {
  const workflow = useWorkflowStore((state) => state.activeWorkflow);
  const startHandoff = useWorkflowStore((state) => state.startHandoff);
  const clearWorkflow = useWorkflowStore((state) => state.clearWorkflow);
  const navigate = useNavigate();

  if (!workflow) return null;

  const destination = workflow.handoff?.destination ?? (workflow.contentPackage ? "voice" : undefined);
  const next = destination ? DESTINATION[destination] : null;
  const Icon = next?.icon ?? (workflow.competitor ? Clapperboard : FileText);
  const title = workflow.contentPackage?.title ?? workflow.competitor?.title ?? workflow.profile?.name ?? "Creator workflow";
  const status = workflow.contentPackage
    ? workflow.handoff?.status === "completed" ? "Production step complete" : "Content package ready"
    : workflow.competitor ? "Competitor selected" : "Channel profile connected";

  const continueWorkflow = () => {
    if (next) {
      startHandoff(destination!);
      navigate(next.route, { state: { workflowId: workflow.id } });
      return;
    }
    navigate("/clone-crush", { state: { workflowId: workflow.id } });
  };

  return (
    <section aria-label="Continue your creator workflow" className="relative overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-r from-card via-primary/[0.08] to-cyan-400/[0.06] p-4 shadow-lg backdrop-blur-xl md:p-5">
      <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-primary/15 blur-3xl" />
      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="rounded-xl border border-primary/25 bg-primary/10 p-2.5"><Icon className="h-5 w-5 text-primary" /></div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Continue creating</p>
            <h2 className="mt-0.5 truncate font-display text-sm font-bold text-foreground md:text-base">{title}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{status}{workflow.profile ? ` · ${workflow.profile.name}` : ""}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={continueWorkflow} className="cyber-button h-11 gap-2 px-4 text-xs">
            {next?.label ?? "Return to analysis"}<ArrowRight className="h-3.5 w-3.5" />
          </Button>
          <Button onClick={clearWorkflow} variant="outline" size="icon" className="h-11 w-11 border-border" aria-label="Dismiss active workflow">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </section>
  );
}
