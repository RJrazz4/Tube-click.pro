import { Link, useLocation } from "react-router-dom";
import { 
  LayoutDashboard, 
  Bot, 
  Image, 
  Eye, 
  Mic,
  Sparkles,
  Share2,
  TrendingUp,
  Search,
  Settings,
  Zap,
  Gift,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/" },
  { icon: Zap, label: "Clone & Crush (Auto-Matrix)", path: "/clone-crush" },
  { icon: Gift, label: "Referral Rewards", path: "/rewards" },
  { icon: Settings, label: "Settings", path: "/settings" },
  { icon: Bot, label: "TubeBot AI", path: "/chat-agent" },
  { icon: Mic, label: "Voiceover", path: "/voice" },
  { icon: Share2, label: "Multi-Platform Repurposer", path: "/repurposer" },
  { icon: TrendingUp, label: "Analytics & ROI Predictor", path: "/analytics" },
  { icon: Search, label: "SEO & Tag Optimizer", path: "/seo" },
];

export function Sidebar() {
  const location = useLocation();

  return (
    <aside className="mobile-safe-bottom fixed left-0 top-0 z-50 flex h-screen w-20 flex-col items-center border-r border-sidebar-border bg-sidebar py-6 max-md:bottom-0 max-md:top-auto max-md:h-[calc(4.5rem+env(safe-area-inset-bottom))] max-md:w-full max-md:flex-row max-md:border-r-0 max-md:border-t max-md:px-2 max-md:py-1">
      {/* Logo */}
      <Link to="/" className="mb-8 group max-md:hidden" aria-label="Go to Dashboard">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-neon-purple to-neon-cyan flex items-center justify-center neon-glow-purple transition-all duration-300 group-hover:scale-110">
          <Sparkles className="w-6 h-6 text-white" aria-hidden="true" />
        </div>
      </Link>

      {/* Navigation */}
      <nav aria-label="Primary navigation" className="flex flex-1 flex-col items-center gap-1.5 overflow-y-auto py-2 scrollbar-none max-md:flex-row max-md:gap-1 max-md:overflow-x-auto max-md:overflow-y-hidden max-md:py-0">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Tooltip key={item.path} delayDuration={0}>
              <TooltipTrigger asChild>
                <Link
                  to={item.path}
                  aria-label={item.label}
                  className={cn(
                    "touch-target w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 relative group shrink-0 max-md:h-11 max-md:w-11",
                    isActive 
                      ? "bg-primary/20 text-primary neon-glow-purple" 
                      : "text-sidebar-foreground hover:text-primary hover:bg-secondary"
                  )}
                >
                  <item.icon className="w-5 h-5" aria-hidden="true" />
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary rounded-r-full" aria-hidden="true" />
                  )}
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" className="bg-card border-border font-display text-xs">
                {item.label}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </nav>

      {/* Sponsor Block */}
      <div className="mt-auto pt-2 max-md:hidden">
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <div 
              className="w-12 h-12 rounded-xl bg-secondary/50 border border-dashed border-border flex items-center justify-center cursor-pointer hover:border-primary/50 transition-colors"
              role="button"
              aria-label="Sponsor space available"
            >
              <span className="text-[10px] text-muted-foreground font-display" aria-hidden="true">AD</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="right" className="bg-card border-border">
            <p className="text-xs">Sponsor Space Available</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </aside>
  );
}
