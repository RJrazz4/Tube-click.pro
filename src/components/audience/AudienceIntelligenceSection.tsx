import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Brain, Loader2, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useSoftGate } from "@/contexts/SoftGateContext";
import { useAudienceBrief, useAudienceProfile, useChallengeState, useEnrollChallenge, useEngineConnection, useGenerateScript } from "@/hooks/useEngineData";
import { engineConfigured, EngineError } from "@/lib/engine/client";
import { ConnectYouTubeCard } from "./ConnectYouTubeCard";
import { ConnectedCreatorHub } from "./ConnectedCreatorHub";
import { HungerGrid } from "./HungerGrid";
import { ChallengeTracker } from "@/components/challenge/ChallengeTracker";
import { DailyDropCard } from "@/components/challenge/DailyDropCard";

/**
 * Dashboard section: Connect card → (Tracker + Daily Drop + Hunger grid + Brief).
 * Renders nothing when the engine isn't configured (graceful for local dev).
 */
export function AudienceIntelligenceSection() {
  const { isAuthenticated } = useSoftGate();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const enabled = engineConfigured() && isAuthenticated;

  // The Render backend engine redirects back here after Google OAuth with a
  // ?youtube=connected|error query param. Consume it: force the connection
  // query to refetch immediately (so the "Connect YouTube" button swaps to the
  // connected card as soon as the vault is written) and clean the marker out
  // of the URL. The TOAST is decided by the ACTUAL refetched connection result
  // (see the second effect), not by the marker alone — a marker of "error" can
  // coexist with a successful upsert, and we must not lie about the outcome.
  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("youtube");
    if (!result) return;
    window.history.replaceState({}, document.title, window.location.pathname);
    void qc.invalidateQueries({ queryKey: ["engine", "connection"] });
    void qc.refetchQueries({ queryKey: ["engine", "connection"] });
  }, [qc]);

  const connection = useEngineConnection(enabled);

  // Decide the connect-outcome toast from the refetched connection state, so it
  // resolves once the query settles (never an endless spinner). Only show it
  // once we actually observed an OAuth return on this mount.
  const [oauthReturn, setOauthReturn] = useState<string | null>(null);
  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("youtube");
    if (result) setOauthReturn(result);
  }, []);
  useEffect(() => {
    if (!oauthReturn) return;
    if (connection.isLoading || connection.isPending) return; // wait for it to settle
    const connected = connection.data?.connected ?? false;
    if (connection.isError || !connected) {
      toast.error("YouTube connection failed. Please try again.", { id: "youtube-connect" });
    } else {
      toast.success("YouTube connected — analytics syncing.", { id: "youtube-connect" });
    }
    setOauthReturn(null);
  }, [oauthReturn, connection.isLoading, connection.isPending, connection.isError, connection.data]);

  const audience = useAudienceProfile(enabled && (connection.data?.connected ?? false));
  const challenge = useChallengeState(enabled);
  const enroll = useEnrollChallenge();
  const generate = useGenerateScript();
  const brief = useAudienceBrief();
  const [briefOpen, setBriefOpen] = useState(false);

  if (!isAuthenticated) return null;
  if (!engineConfigured()) {
    return (
      <Card className="border-dashed border-border/70 bg-card/30">
        <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-secondary/50">
            <Brain className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display font-semibold text-foreground">Audience insights are not connected</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              You can still analyze any public YouTube channel and create a content package. Connect the audience engine when it is available to see viewer-driven topics and daily recommendations.
            </p>
          </div>
          <Button asChild size="sm" variant="outline" className="shrink-0">
            <Link to="/clone-crush">Analyze a channel</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }
  // The connection status query is the source of truth for the "Connect"
  // gateway. If it has settled into an error (the engine is unreachable,
  // auth failed, or the request timed out), resolve to an actionable error
  // state — never spin forever. Timeout is enforced in engineFetch.
  if (connection.isError && !connection.isLoading && !connection.isFetching) {
    const msg = connection.error instanceof EngineError ? connection.error.message : "The intelligence engine is unreachable.";
    return (
      <Card className="glass border-border/60">
        <CardContent className="p-5 flex flex-col items-center gap-3 text-center">
          <p className="text-xs text-red-400 font-mono">{msg}</p>
          <Button size="sm" variant="outline" className="gap-2" onClick={() => void qc.invalidateQueries({ queryKey: ["engine", "connection"] })}>
            <RefreshCw className="w-3.5 h-3.5" /> Retry connection
          </Button>
        </CardContent>
      </Card>
    );
  }
  if (connection.isPending || challenge.isPending) {
    return (
      <Card className="glass border-border/60">
        <CardContent className="p-5 flex items-center gap-3 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading audience intelligence…
        </CardContent>
      </Card>
    );
  }

  const connected = connection.data?.connected ?? false;
  const connectionError =
    connection.error instanceof EngineError && connection.error.status !== 404 ? connection.error : null;

  const doEnroll = () => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";
    enroll.mutate(tz);
  };

  const onGenerateTopic = (topic: string) => {
    generate.mutate(topic, { onSuccess: () => navigate("/clone-crush") });
  };

  return (
    <div className="space-y-4 md:space-y-5">
      {/* 1. Connect — the trust gateway */}
      {!connected && <ConnectYouTubeCard />}
      {connectionError && (
        <p className="text-xs text-red-400 font-mono">ENGINE LINK: {connectionError.message}</p>
      )}
      {connected && connection.data?.status && connection.data.status !== "active" && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="p-4 text-sm text-amber-300">
            YouTube link needs re-connecting (status: {connection.data.status}).{" "}
            <button className="underline" onClick={() => void qc.invalidateQueries({ queryKey: ["engine", "connection"] })}>
              <RefreshCw className="w-3 h-3 inline" /> refresh
            </button>
          </CardContent>
        </Card>
      )}

      {/* Connected Creator Hub — the hero module for the user's own channel */}
      {connected && <ConnectedCreatorHub connection={connection} />}

      {/* 2. The challenge — always the hero once authenticated */}
      <ChallengeTracker state={challenge.data} onEnroll={doEnroll} enrolling={enroll.isPending} />
      <DailyDropCard state={challenge.data} />

      {/* 3. Hunger cards (needs a connected channel + computed profile) */}
      {connected &&
        (audience.data ? (
          <>
            <HungerGrid profile={audience.data} onGenerate={onGenerateTopic} />
            <BriefCard
              tier={audience.data.tier}
              narrative={audience.data.narrative?.brief ?? null}
              loading={brief.isPending}
              open={briefOpen}
              onGenerate={() => {
                setBriefOpen(true);
                brief.mutate();
              }}
            />
          </>
        ) : audience.isLoading ? (
          <Card className="glass border-border/60">
            <CardContent className="p-5 flex items-center gap-3 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Computing your audience profile…
            </CardContent>
          </Card>
        ) : null)}
    </div>
  );
}

function BriefCard({
  tier,
  narrative,
  loading,
  open,
  onGenerate,
}: {
  tier: "free" | "premium";
  narrative: { headline: string; who: string; where_when: string; what_they_want: string[]; retention_truth: string; next_3_videos: Array<{ title_idea: string; why: string; hunger_topic: string }> } | null;
  loading: boolean;
  open: boolean;
  onGenerate: () => void;
}) {
  if (tier !== "premium") {
    return (
      <Card className="border-dashed border-border/70 bg-card/30">
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <Brain className="w-5 h-5 text-primary/70" />
          <div className="flex-1 min-w-0">
            <p className="font-display font-semibold">The Audience Brief</p>
            <p className="text-xs text-muted-foreground">A principal strategist's private memo on your channel — Pro feature</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => (window.location.hash = "")}>
            Pro only
          </Button>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="glass-strong border-primary/30 bracket">
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="font-display font-semibold flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary" /> The Audience Brief
          </p>
          {!narrative && (
            <Button size="sm" onClick={onGenerate} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Generate"}
            </Button>
          )}
        </div>
        {narrative ? (
          <div className="space-y-2 text-sm">
            <p className="font-display font-semibold text-foreground">{narrative.headline}</p>
            <p className="text-muted-foreground">{narrative.who}</p>
            <p className="text-muted-foreground">{narrative.where_when}</p>
            <p className="text-amber-300/90 text-xs font-mono">RETENTION TRUTH: {narrative.retention_truth}</p>
            <div>
              <p className="text-xs font-semibold text-foreground mt-2">Next 3 videos</p>
              <ul className="space-y-1">
                {narrative.next_3_videos.map((v) => (
                  <li key={v.title_idea} className="text-xs text-muted-foreground">
                    • <span className="text-foreground">{v.title_idea}</span> — {v.why}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          open && <p className="text-xs text-muted-foreground">Your strategist memo is being written…</p>
        )}
      </CardContent>
    </Card>
  );
}
