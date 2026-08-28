import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3,
  BookOpen,
  ChevronRight,
  Gift,
  HelpCircle,
  LayoutDashboard,
  Menu,
  Mic,
  PenLine,
  Search,
  Settings,
  Share2,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SupportModal } from "./SupportModal";

const navGroups = [
  {
    label: "Workspace",
    items: [
      { icon: LayoutDashboard, label: "Dashboard", description: "Your creator home", path: "/" },
      { icon: Zap, label: "Analyze", description: "Find winning videos and create a package", path: "/clone-crush" },
      { icon: BookOpen, label: "Library", description: "Find your saved content", path: "/library" },
    ],
  },
  {
    label: "Create & grow",
    items: [
      { icon: PenLine, label: "Create from a topic", description: "Generate titles, hooks, and scripts", path: "/create" },
      { icon: Mic, label: "Voiceover", description: "Turn scripts into narration", path: "/voice" },
      { icon: Share2, label: "Repurpose", description: "Format content for other platforms", path: "/repurposer" },
      { icon: Search, label: "SEO", description: "Improve titles and tags", path: "/seo" },
      { icon: BarChart3, label: "Growth estimator", description: "Plan reach and revenue", path: "/analytics" },
    ],
  },
];

const mobilePrimaryItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/" },
  { icon: Zap, label: "Analyze", path: "/clone-crush" },
  { icon: Mic, label: "Voiceover", path: "/voice" },
  { icon: Share2, label: "Repurpose", path: "/repurposer" },
];

const mobileMoreItems = [
  { icon: BookOpen, label: "Library", description: "Find your saved content", path: "/library" },
  { icon: PenLine, label: "Create from topic", description: "Generate titles, hooks, and scripts", path: "/create" },
  { icon: Search, label: "SEO", description: "Improve titles and tags", path: "/seo" },
  { icon: BarChart3, label: "Growth estimator", description: "Plan reach and revenue", path: "/analytics" },
  { icon: Gift, label: "Referral rewards", description: "Earn Pro with qualified referrals", path: "/rewards" },
  { icon: Settings, label: "Settings", description: "Account, plan, and data", path: "/settings" },
  { icon: HelpCircle, label: "Support", description: "Contact customer support", path: "/support" },
];

function isActivePath(currentPath: string, itemPath: string): boolean {
  return itemPath === "/" ? currentPath === "/" : currentPath.startsWith(itemPath);
}

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);

  return (
    <aside
      aria-label="Primary navigation"
      className="mobile-safe-bottom fixed left-0 top-0 z-50 flex h-screen w-64 flex-col border-r border-primary/10 glass-strong py-5 backdrop-blur-2xl max-md:bottom-0 max-md:top-auto max-md:h-[calc(4.5rem+env(safe-area-inset-bottom))] max-md:w-full max-md:flex-row max-md:border-r-0 max-md:border-t max-md:px-2 max-md:py-1"
    >
      <div className="absolute inset-0 ghost-scanline opacity-[0.015] pointer-events-none max-md:hidden" />

      {/* Desktop navigation */}
      <div className="relative z-10 hidden h-full min-h-0 flex-col md:flex">
        <Link to="/" className="mb-7 flex items-center gap-3 px-4" aria-label="Go to TubeClick Pro dashboard">
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-gradient-to-br from-neon-purple to-neon-cyan neon-glow-purple transition-transform duration-300 hover:scale-105">
            <Sparkles className="h-5 w-5 text-white" aria-hidden="true" />
            <span className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-background bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)]" />
          </div>
          <div className="min-w-0">
            <p className="font-display text-sm font-black tracking-wide text-foreground">
              TubeClick <span className="text-cyan-300">Pro</span>
            </p>
            <p className="mt-0.5 text-[9px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Creator workspace</p>
          </div>
        </Link>

        <nav aria-label="Workspace navigation" className="min-h-0 flex-1 space-y-6 overflow-y-auto px-3 scrollbar-none">
          {navGroups.map((group) => (
            <div key={group.label}>
              <p className="mb-2 px-3 text-[9px] font-mono font-bold uppercase tracking-[0.2em] text-muted-foreground/60">
                {group.label}
              </p>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const active = isActivePath(location.pathname, item.path);
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group flex min-h-[52px] items-center gap-3 rounded-xl border px-3 py-2 transition-all duration-200",
                        active
                          ? "border-primary/25 bg-primary/15 text-primary shadow-[0_0_18px_rgba(139,92,246,0.14)]"
                          : "border-transparent text-sidebar-foreground hover:border-primary/15 hover:bg-secondary/60 hover:text-foreground",
                      )}
                    >
                      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border", active ? "border-primary/25 bg-primary/15" : "border-border/50 bg-secondary/40 group-hover:border-primary/20")}>
                        <item.icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold leading-tight">{item.label}</span>
                        <span className="mt-0.5 block truncate text-[10px] leading-tight text-muted-foreground">{item.description}</span>
                      </span>
                      <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground/40 transition-transform", active && "translate-x-0.5 text-primary")} aria-hidden="true" />
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="mt-4 space-y-2 px-3">
          <Link
            to="/rewards"
            className={cn(
              "group flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors",
              isActivePath(location.pathname, "/rewards")
                ? "border-amber-400/30 bg-amber-400/10 text-amber-200"
                : "border-amber-400/15 bg-amber-400/5 text-amber-200/80 hover:border-amber-400/30 hover:bg-amber-400/10",
            )}
          >
            <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-400/20 bg-amber-400/10">
              <Gift className="h-4 w-4 text-amber-300" aria-hidden="true" />
              <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-amber-300" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold leading-tight">Referral rewards</span>
              <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">Earn Pro with qualified referrals</span>
            </span>
          </Link>

          <Link
            to="/settings"
            aria-current={isActivePath(location.pathname, "/settings") ? "page" : undefined}
            className={cn(
              "flex min-h-[46px] items-center gap-3 rounded-xl border px-3 transition-colors",
              isActivePath(location.pathname, "/settings")
                ? "border-primary/25 bg-primary/15 text-primary"
                : "border-transparent text-sidebar-foreground hover:border-primary/15 hover:bg-secondary/60 hover:text-foreground",
            )}
          >
            <Settings className="ml-1 h-4 w-4" aria-hidden="true" />
            <span className="text-sm font-semibold">Settings</span>
          </Link>

          <button
            type="button"
            onClick={() => setSupportOpen(true)}
            className={cn(
              "flex min-h-[46px] w-full items-center gap-3 rounded-xl border px-3 transition-colors text-left",
              "border-transparent text-sidebar-foreground hover:border-primary/15 hover:bg-secondary/60 hover:text-foreground",
            )}
          >
            <HelpCircle className="ml-1 h-4 w-4" aria-hidden="true" />
            <span className="text-sm font-semibold">Support</span>
          </button>

          <div className="flex items-center justify-between rounded-lg border border-primary/10 bg-secondary/25 px-3 py-2">
            <span className="flex items-center gap-1.5 text-[9px] font-mono text-green-400"><span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />System ready</span>
            <span className="text-[9px] font-mono text-muted-foreground">Creator tools</span>
          </div>
        </div>
      </div>

      {/* Mobile navigation: four frequent destinations plus a labeled More menu. */}
      <nav aria-label="Mobile navigation" className="relative z-10 flex w-full items-center justify-between gap-1 md:hidden">
        {mobilePrimaryItems.map((item) => {
          const active = isActivePath(location.pathname, item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-[50px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl border px-1 text-[10px] font-semibold transition-colors",
                active ? "border-primary/25 bg-primary/15 text-primary" : "border-transparent text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
              )}
            >
              <item.icon className="h-4 w-4" aria-hidden="true" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          aria-label="Open more navigation options"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((open) => !open)}
          className={cn(
            "flex min-h-[50px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl border px-1 text-[10px] font-semibold transition-colors",
            moreOpen ? "border-primary/25 bg-primary/15 text-primary" : "border-transparent text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
          )}
        >
          {moreOpen ? <X className="h-4 w-4" aria-hidden="true" /> : <Menu className="h-4 w-4" aria-hidden="true" />}
          <span>More</span>
        </button>
      </nav>

      {moreOpen && (
        <div className="absolute bottom-[calc(100%+0.5rem)] left-2 right-2 z-20 rounded-2xl border border-primary/20 bg-background/95 p-2 shadow-[0_0_35px_rgba(0,0,0,0.45)] backdrop-blur-2xl md:hidden">
          <div className="mb-1 flex items-center justify-between px-2 py-1">
            <p className="text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-muted-foreground">More tools</p>
            <button type="button" aria-label="Close more navigation options" onClick={() => setMoreOpen(false)} className="rounded-md p-1 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-2 gap-1">
            {mobileMoreItems.map((item) => {
              const active = isActivePath(location.pathname, item.path);
              return (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => {
                    setMoreOpen(false);
                    if (item.path === "/support") {
                      setSupportOpen(true);
                    } else {
                      navigate(item.path);
                    }
                  }}
                  className={cn("flex min-h-[54px] items-center gap-2 rounded-xl border px-3 text-left transition-colors", active ? "border-primary/25 bg-primary/15 text-primary" : "border-border/50 bg-secondary/30 text-foreground hover:border-primary/20 hover:bg-secondary/60")}
                >
                  <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold">{item.label}</span>
                    <span className="mt-0.5 block truncate text-[9px] text-muted-foreground">{item.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Support Modal */}
      <SupportModal isOpen={supportOpen} onClose={() => setSupportOpen(false)} />

    </aside>
  );
}
