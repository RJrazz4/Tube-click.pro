import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Bot, Mic, Sparkles, Share2, TrendingUp, Search, Settings, Zap, Gift, Terminal, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard • Ghost War Room", path: "/" },
  { icon: Zap, label: "Clone & Crush • Ghost Protocol", path: "/clone-crush" },
  { icon: Gift, label: "Referral Rewards • Private Tracker", path: "/rewards" },
  { icon: Bot, label: "TubeBot AI • Quantum Cached", path: "/chat-agent" },
  { icon: Mic, label: "Voiceover • Neural Engine", path: "/voice" },
  { icon: Share2, label: "Multi-Platform Repurposer", path: "/repurposer" },
  { icon: TrendingUp, label: "Analytics & ROI • Ghost Calc", path: "/analytics" },
  { icon: Search, label: "SEO & Tag Optimizer", path: "/seo" },
  { icon: Settings, label: "Settings • Ghost Mesh", path: "/settings" },
];

export function Sidebar() {
  const location = useLocation();
  return (
    <aside className="mobile-safe-bottom fixed left-0 top-0 z-50 flex h-screen w-20 flex-col items-center border-r border-primary/10 glass-strong py-6 max-md:bottom-0 max-md:top-auto max-md:h-[calc(4.5rem+env(safe-area-inset-bottom))] max-md:w-full max-md:flex-row max-md:border-r-0 max-md:border-t max-md:px-2 max-md:py-1 backdrop-blur-2xl">
      <div className="absolute inset-0 ghost-scanline opacity-[0.015] pointer-events-none max-md:hidden" />
      <Link to="/" className="mb-8 group max-md:hidden relative z-10" aria-label="Go to Dashboard">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-neon-purple to-neon-cyan flex items-center justify-center neon-glow-purple transition-all duration-300 group-hover:scale-110 border border-primary/20">
          <Sparkles className="w-6 h-6 text-white" aria-hidden="true" />
        </div>
        <div className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full bg-green-400 border-2 border-background animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.8)]" />
      </Link>

      <nav aria-label="Primary navigation" className="flex flex-1 flex-col items-center gap-1.5 overflow-y-auto py-2 scrollbar-none max-md:flex-row max-md:gap-1 max-md:overflow-x-auto max-md:overflow-y-hidden max-md:py-0 relative z-10">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Tooltip key={item.path} delayDuration={0}>
              <TooltipTrigger asChild>
                <Link
                  to={item.path}
                  aria-label={item.label}
                  className={cn(
                    "touch-target w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 relative group shrink-0 max-md:h-11 max-md:w-11 border",
                    isActive ? "bg-primary/15 text-primary border-primary/20 neon-glow-purple shadow-[0_0_15px_rgba(139,92,246,0.2)]" : "text-sidebar-foreground hover:text-primary hover:bg-secondary/60 border-transparent hover:border-primary/10"
                  )}
                >
                  <item.icon className="w-5 h-5" aria-hidden="true" />
                  {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary rounded-r-full shadow-[0_0_8px_rgba(139,92,246,0.8)]" aria-hidden="true" />}
                  {item.path === "/rewards" && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-400 animate-pulse" />}
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" className="glass-strong border-primary/20 font-mono text-xs"><p>{item.label}</p><p className="text-[9px] text-muted-foreground mt-1">MUM-01 • tubeclickpro.in • Ghost Protocol</p></TooltipContent>
            </Tooltip>
          );
        })}
      </nav>

      <div className="mt-auto pt-2 max-md:hidden relative z-10 flex flex-col items-center gap-2">
        <div className="rounded-lg border border-primary/15 bg-secondary/30 px-2 py-1.5 flex flex-col items-center gap-1">
          <span className="flex items-center gap-1 text-[8px] font-mono text-green-400"><span className="w-1 h-1 rounded-full bg-green-400 animate-pulse" />MUM-01</span>
          <span className="text-[8px] font-mono text-muted-foreground">87ms • 3 nodes</span>
        </div>
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <div className="w-12 h-12 rounded-xl glass-ghost border-primary/10 flex items-center justify-center cursor-pointer hover:border-primary/30 transition-colors group" role="button" aria-label="Ghost mesh status">
              <Terminal className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
          </TooltipTrigger>
          <TooltipContent side="right" className="glass-strong border-primary/20">
            <p className="text-xs font-mono flex items-center gap-1.5"><Cpu className="w-3 h-3 text-green-400 animate-pulse" />Ghost Mesh • 3 Nodes • Quantum Cached</p>
            <p className="text-[10px] text-muted-foreground font-mono mt-1">MUM-01 87ms • BLR-02 92ms • DEL-03 78ms • Encrypted</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </aside>
  );
}
