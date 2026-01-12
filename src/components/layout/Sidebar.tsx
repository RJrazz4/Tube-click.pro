import { Link, useLocation } from "react-router-dom";
import { 
  LayoutDashboard, 
  Bot, 
  Image, 
  Eye, 
  Mic,
  Sparkles,
  Film
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/" },
  { icon: Bot, label: "TubeBot AI", path: "/chat-agent" },
  { icon: Film, label: "Storyboard", path: "/storyboard" },
  { icon: Image, label: "Thumbnails", path: "/thumbnails" },
  { icon: Eye, label: "Vision Guide", path: "/vision-guide" },
  { icon: Mic, label: "Voiceover", path: "/voice" },
];

export function Sidebar() {
  const location = useLocation();

  return (
    <aside className="fixed left-0 top-0 h-screen w-20 bg-sidebar border-r border-sidebar-border flex flex-col items-center py-6 z-50">
      {/* Logo */}
      <Link to="/" className="mb-8 group" aria-label="Go to Dashboard">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-neon-purple to-neon-cyan flex items-center justify-center neon-glow-purple transition-all duration-300 group-hover:scale-110">
          <Sparkles className="w-6 h-6 text-white" aria-hidden="true" />
        </div>
      </Link>

      {/* Navigation */}
      <nav className="flex-1 flex flex-col items-center gap-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Tooltip key={item.path} delayDuration={0}>
              <TooltipTrigger asChild>
                <Link
                  to={item.path}
                  aria-label={item.label}
                  className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 relative group",
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
      <div className="mt-auto">
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
