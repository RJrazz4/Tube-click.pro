import { LogIn, LogOut, ShieldCheck, Sparkles, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useState } from "react";
import { GhostAdminModal } from "@/components/GhostAdminModal";
import { useGhostTrigger } from "@/hooks/useGhostTrigger";
import { useAuthStore } from "@/stores/useAuthStore";
import { useSoftGate } from "@/contexts/SoftGateContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function TopBar() {
  const [ghostOpen, setGhostOpen] = useState(false);
  const handleGhostTrigger = useGhostTrigger(() => setGhostOpen(true));
  const user = useAuthStore((s) => s.user);
  const { isAuthenticated, requestAuthentication } = useSoftGate();

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) toast.error("Could not sign out. Please try again.");
    else toast.success("Signed out successfully");
  };

  return (
    <header className="fixed top-0 left-20 right-0 h-16 bg-background/80 backdrop-blur-xl border-b border-border z-40 flex items-center justify-between px-6">
      {/* Logo - triple click triggers ghost admin */}
      <div className="flex items-center gap-3">
        <h1
          className="font-display text-xl font-bold cursor-pointer select-none"
          onClick={handleGhostTrigger}
        >
          <span className="text-glow-purple text-primary">Tube</span>
          <span className="text-glow-cyan text-accent">Genius</span>
          <span className="text-foreground ml-1">Neural Engine</span>
        </h1>
        <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary text-[10px] font-display uppercase tracking-wider">
          Secure
        </span>
      </div>

      {/* Ghost Admin Modal */}
      <GhostAdminModal open={ghostOpen} onOpenChange={setGhostOpen} />

      {/* Actions */}
      <div className="flex items-center gap-3">
        {/* Secure status indicators — no BYOK */}
        <div className="hidden md:flex items-center gap-2 text-xs">
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
            <ShieldCheck className="w-3 h-3" />
            Server-Side Secure
          </span>
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
            <Server className="w-3 h-3" />
            Vercel Edge Ready
          </span>
        </div>

        {isAuthenticated ? (
          <Button variant="ghost" size="sm" onClick={() => void signOut()} className="gap-2 text-muted-foreground hover:text-foreground">
            <span className="hidden max-w-32 truncate sm:inline">{user?.name || user?.email || "Account"}</span>
            <LogOut className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={() => void requestAuthentication("save your work and start earning Pro")} className="gap-2 border-primary/30 bg-primary/5 hover:bg-primary/10">
            <LogIn className="h-4 w-4" />
            <span className="hidden sm:inline">Sign In</span>
          </Button>
        )}

        <Button variant="outline" size="sm" asChild className="relative gap-2 border-primary/30 bg-primary/5 pr-4 hover:border-primary/50 hover:bg-primary/10">
          <Link to="/rewards">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="hidden sm:inline">Unlock Pro for Free</span>
            <span className="absolute -right-2 -top-2.5 whitespace-nowrap rounded-full bg-gradient-to-r from-purple-500 via-pink-500 to-rose-500 px-1.5 py-0.5 text-[9px] font-bold text-white shadow-lg shadow-pink-500/40">
              ₹0
            </span>
          </Link>
        </Button>
      </div>
    </header>
  );
}
