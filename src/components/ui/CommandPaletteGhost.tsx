import { useEffect, useState } from "react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { BarChart3, BookOpen, Gift, LayoutDashboard, Mic, PenLine, Search, Settings, Share2, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";

/**
 * Global command palette (Ctrl/Cmd+K).
 *
 * The palette uses creator tasks rather than internal system terminology so it
 * remains useful to first-time users while preserving the existing shortcuts.
 */

const COMMAND_GROUPS = [
  {
    heading: "Workspace",
    commands: [
      { id: "dashboard", label: "Open Dashboard", description: "Resume your creator workspace", icon: LayoutDashboard, path: "/" },
      { id: "analyze", label: "Analyze a YouTube channel", description: "Find winning videos and create a package", icon: Zap, path: "/clone-crush" },
      { id: "library", label: "Open Library", description: "Find your saved content", icon: BookOpen, path: "/library" },
    ],
  },
  {
    heading: "Create & grow",
    commands: [
      { id: "create", label: "Create from a topic", description: "Generate titles, hooks, and scripts", icon: PenLine, path: "/create" },
      { id: "voiceover", label: "Generate a voiceover", description: "Turn a script into narration", icon: Mic, path: "/voice" },
      { id: "repurpose", label: "Repurpose content", description: "Format content for other platforms", icon: Share2, path: "/repurposer" },
      { id: "seo", label: "Improve titles and tags", description: "Open the SEO optimizer", icon: Search, path: "/seo" },
      { id: "analytics", label: "Plan growth and revenue", description: "Open the growth estimator", icon: BarChart3, path: "/analytics" },
    ],
  },
  {
    heading: "Account",
    commands: [
      { id: "rewards", label: "View referral rewards", description: "Track your path to Pro", icon: Gift, path: "/rewards" },
      { id: "settings", label: "Open settings", description: "Manage your account and data", icon: Settings, path: "/settings" },
    ],
  },
];

export function CommandPaletteGhost() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if ((event.key === "k" && (event.metaKey || event.ctrlKey)) || event.key === "/") {
        const target = event.target as HTMLElement | null;
        if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable) return;
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const goTo = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-[640px] overflow-hidden border-primary/20 bg-[#0a0a0f]/95 p-0 glass-strong backdrop-blur-2xl bracket">
        <Command className="bg-transparent">
          <div className="flex items-center border-b border-border/40 px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <CommandInput
              placeholder="Search creator tools… (Ctrl+K)"
              className="border-0 text-sm focus:ring-0"
              aria-label="Search creator tools"
            />
            <span className="ml-2 rounded border border-border/40 bg-secondary/60 px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground">ESC</span>
          </div>
          <CommandList className="max-h-[440px] p-2">
            <CommandEmpty className="py-8 text-center text-sm text-muted-foreground">No creator tools found.</CommandEmpty>
            {COMMAND_GROUPS.map((group) => (
              <CommandGroup key={group.heading} heading={group.heading} className="text-[10px] font-mono">
                {group.commands.map((command) => (
                  <CommandItem
                    key={command.id}
                    value={`${command.label} ${command.description}`}
                    onSelect={() => goTo(command.path)}
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-transparent px-3 py-3 hover:border-primary/20 hover:bg-primary/5 data-[selected=true]:border-primary/20 data-[selected=true]:bg-primary/10"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/15 bg-primary/10">
                      <command.icon className="h-4 w-4 text-primary" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">{command.label}</p>
                      <p className="text-[10px] text-muted-foreground">{command.description}</p>
                    </div>
                    <span className="hidden text-[9px] text-muted-foreground/50 md:block">↵</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
            <CommandGroup heading="Quick actions" className="text-[10px] font-mono">
              <CommandItem onSelect={() => { setOpen(false); void navigator.clipboard.writeText("https://tubeclickpro.in"); }} className="cursor-pointer text-xs">Copy TubeClick Pro link</CommandItem>
              <CommandItem onSelect={() => {
                setOpen(false);
                // Keep the existing cache action scoped to TubeClick's own
                // legacy cache prefix. Auth and user workspaces are untouched.
                for (let index = localStorage.length - 1; index >= 0; index -= 1) {
                  const key = localStorage.key(index);
                  if (key?.startsWith("tc-cache:")) localStorage.removeItem(key);
                }
                window.dispatchEvent(new CustomEvent("tc-cache-purged"));
              }} className="cursor-pointer text-xs text-amber-300">Clear temporary cache</CommandItem>
            </CommandGroup>
          </CommandList>
          <div className="flex items-center justify-between border-t border-border/20 px-3 py-2 text-[9px] text-muted-foreground">
            <span>Search by task, not system name</span>
            <span>ESC to close • ↑↓ to navigate</span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
