import { useState } from "react";
import { Youtube, Loader2, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { EngineError, connectYouTubeUrl } from "@/lib/engine/client";

/**
 * "Connect YouTube" — the ONLY sanctioned copy (never "Sign in with Google").
 * The Google consent screen is branded TubeClick Pro, so the trust chain is
 * consistent at every step.
 */
export function ConnectYouTubeCard() {
  const [connecting, setConnecting] = useState(false);

  const connect = async () => {
    setConnecting(true);
    try {
      const authUrl = await connectYouTubeUrl();
      window.location.href = authUrl;
    } catch (err) {
      toast.error(
        err instanceof EngineError ? err.message : "Could not start YouTube connect. Is the engine configured?",
      );
      setConnecting(false);
    }
  };

  return (
    <Card className="glass-strong border-red-500/30 bracket overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-red-500/10 via-transparent to-primary/10 pointer-events-none" />
      <CardContent className="relative p-5 md:p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-red-600/15 border border-red-500/30 flex items-center justify-center">
            <Youtube className="w-6 h-6 text-red-500" />
          </div>
          <div>
            <h3 className="font-display text-lg md:text-xl font-bold text-foreground">Connect YouTube</h3>
            <p className="text-[10px] font-mono text-primary/60">READ-ONLY ANALYTICS • NO UPLOAD ACCESS • DISCONNECT ANYTIME</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
          Unlock your private analytics — watch time, geography, demographics, click behavior — and the engine
          computes what <em>your</em> audience is hungry for. Read-only scopes; we can never touch your channel.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void connect()} disabled={connecting} className="font-semibold">
            {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Youtube className="w-4 h-4" />}
            Connect YouTube
          </Button>
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            Encrypted token vault • 30-day raw retention • evidence-based, never guessed
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
