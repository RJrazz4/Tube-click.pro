import { LogIn, LogOut, ShieldCheck, Sparkles, Server, Terminal, Cpu, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useState } from "react";
import { GhostAdminModal } from "@/components/GhostAdminModal";
import { useGhostTrigger } from "@/hooks/useGhostTrigger";
import { useAuthStore } from "@/stores/useAuthStore";
import { useSoftGate } from "@/contexts/SoftGateContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { GhostNodeStatus } from "@/components/ui/GhostNodeStatus";
import { LiveActiveCounter } from "@/components/ui/LiveActiveCounter";

export function TopBar() {
  const [ghostOpen, setGhostOpen] = useState(false);
  const handleGhostTrigger = useGhostTrigger(() => setGhostOpen(true));
  const user = useAuthStore((s) => s.user);
  const { isAuthenticated, requestAuthentication } = useSoftGate();

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) toast.error("Ghost logout interference - retry via MUM-01");
    else toast.success("Ghost session terminated • MUM-01 • Quantum cache purged");
  };

  return (
    <header className="fixed top-0 left-20 right-0 z-40 flex h-16 items-center justify-between border-b border-primary/10 glass-strong px-6 backdrop-blur-2xl max-md:left-0 max-md:px-3">
      <div className="absolute inset-0 ghost-scanline opacity-[0.02] pointer-events-none" />
      <div className="flex items-center gap-3 max-sm:gap-1.5 relative z-10">
        <h1 className="font-display text-xl font-bold cursor-pointer select-none flex items-center gap-2" onClick={handleGhostTrigger}>
          <span className="text-glow-purple text-primary">Tube</span>
          <span className="text-glow-cyan text-accent max-sm:hidden">Click Pro</span>
          <span className="ml-1 text-[10px] font-mono bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded-full hidden md:inline">GHOST PROTOCOL v4.2 • LEVEL 4</span>
        </h1>
        <div className="hidden lg:flex items-center gap-2 ml-4">
          <LiveActiveCounter compact />
          <GhostNodeStatus compact />
        </div>
      </div>

      <GhostAdminModal open={ghostOpen} onOpenChange={setGhostOpen} />

      <div className="flex items-center gap-2 max-sm:gap-1.5 relative z-10">
        <div className="hidden md:flex items-center gap-1.5 text-[10px] font-mono">
          <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-green-500/10 text-green-400 border border-green-500/20"><ShieldCheck className="w-3 h-3" />Ghost Secure</span>
          <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 text-primary border border-primary/20"><Server className="w-3 h-3" />MUM-01 • 87ms</span>
          <span className="hidden xl:flex items-center gap-1 px-2 py-1 rounded-full bg-cyan-400/10 text-cyan-300 border border-cyan-400/20"><Radio className="w-3 h-3 animate-pulse" />War Room Live</span>
        </div>

        {isAuthenticated ? (
          <Button variant="ghost" size="sm" onClick={() => void signOut()} className="gap-2 text-muted-foreground hover:text-foreground font-mono text-xs">
            <span className="hidden max-w-32 truncate sm:inline">{user?.name || user?.email || "Ghost_User"}</span>
            <LogOut className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={() => void requestAuthentication("save your work and start earning Pro via ghost uplink")} className="gap-2 border-primary/20 bg-primary/5 hover:bg-primary/10 font-mono text-xs">
            <LogIn className="h-4 w-4" />
            <span className="hidden sm:inline">Sign In • Ghost</span>
          </Button>
        )}

        <Button variant="outline" size="sm" asChild className="relative gap-2 border-primary/20 bg-primary/5 pr-7 hover:border-primary/40 hover:bg-primary/10 font-mono text-xs">
          <Link to="/rewards">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="hidden sm:inline">Unlock Pro ₹0</span>
            <span className="absolute -right-1.5 -top-2 whitespace-nowrap rounded-full bg-gradient-to-r from-purple-500 via-pink-500 to-rose-500 px-1.5 py-0.5 text-[9px] font-bold text-white shadow-lg shadow-pink-500/30 animate-pulse">$97→₹0</span>
          </Link>
        </Button>
      </div>
    </header>
  );
}
