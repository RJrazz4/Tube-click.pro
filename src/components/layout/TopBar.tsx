import { LogIn, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { GhostAdminModal } from "@/components/GhostAdminModal";
import { useGhostTrigger } from "@/hooks/useGhostTrigger";
import { useSoftGate } from "@/contexts/SoftGateContext";
import { useProUpgrade } from "@/contexts/ProUpgradeContext";
import { GhostNodeStatus } from "@/components/ui/GhostNodeStatus";
import { LiveActiveCounter } from "@/components/ui/LiveActiveCounter";
import { UserMenu } from "@/components/layout/UserMenu";

export function TopBar() {
  const [ghostOpen, setGhostOpen] = useState(false);
  const handleGhostTrigger = useGhostTrigger(() => setGhostOpen(true));
  const { isAuthenticated, requestAuthentication } = useSoftGate();
  const { openProUpgrade } = useProUpgrade();

  return (
    <header className="fixed top-0 left-0 right-0 z-40 flex h-16 items-center justify-between border-b border-primary/10 glass-strong px-6 backdrop-blur-2xl md:left-64 max-md:px-3">
      <div className="absolute inset-0 ghost-scanline opacity-[0.02] pointer-events-none" />
      <div className="flex items-center gap-3 max-sm:gap-1.5 relative z-10">
        <h1 className="font-display text-xl font-bold cursor-pointer select-none flex items-center gap-2" onClick={handleGhostTrigger}>
          <span className="text-glow-purple text-primary">Tube</span>
          <span className="text-glow-cyan text-accent max-sm:hidden">Click Pro</span>
          <span className="ml-1 text-[10px] font-mono bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded-full hidden md:inline">Creator OS</span>
        </h1>
        <div className="hidden lg:flex items-center gap-2 ml-4">
          <LiveActiveCounter compact />
          <GhostNodeStatus compact />
        </div>
      </div>

      <GhostAdminModal open={ghostOpen} onOpenChange={setGhostOpen} />

      <div className="flex items-center gap-2 max-sm:gap-1.5 relative z-10">
        <div className="hidden md:flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
            <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
            All systems operational
          </span>
        </div>

        {isAuthenticated ? (
          <UserMenu />
        ) : (
          <Button variant="outline" size="sm" onClick={() => void requestAuthentication("save your work and unlock Pro rewards")} className="gap-2 border-primary/20 bg-primary/5 hover:bg-primary/10 font-mono text-xs">
            <LogIn className="h-4 w-4" />
            <span className="hidden sm:inline">Sign In</span>
          </Button>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={() => openProUpgrade({ defaultTab: "referral", reason: "topbar" })}
          className="relative gap-2 border-primary/20 bg-primary/5 hover:border-primary/40 hover:bg-primary/10 text-xs"
          title="Upgrade — or earn Pro free with referrals"
        >
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="hidden sm:inline">Go Pro</span>
        </Button>
      </div>
    </header>
  );
}
