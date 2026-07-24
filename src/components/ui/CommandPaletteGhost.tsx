import { useEffect, useState } from "react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Zap, Terminal, Cpu, Radio, Gift, Search, Flame, Ghost } from "lucide-react";
import { useNavigate } from "react-router-dom";

/**
 * Command Palette Ghost - Elite tool signature (Raycast / Linear feel)
 * Uses cmdk already in deps, zero extra cost
 * Ctrl+K / Cmd+K opens palette with ghost commands
 */

const COMMANDS = [
  { id: "clone", label: "Deploy Clone & Crush Ghost Protocol", icon: Zap, path: "/clone-crush", mono: "GHOST • CHAIN-LOOP • MUM-01" },
  { id: "rewards", label: "Open Referral War Room", icon: Gift, path: "/rewards", mono: "ELITE • ₹0 • LEVEL 4" },
  { id: "nodes", label: "Show Ghost Node Status", icon: Cpu, path: "/clone-crush", mono: "MUM-01 • BLR-02 • DEL-03 • 87ms" },
  { id: "intel", label: "War Room Ticker • Live Intel", icon: Radio, path: "/", mono: "LIVE • 2,847 GHOST OPS" },
  { id: "search", label: "SEO & Tag Optimizer", icon: Search, path: "/seo", mono: "HIGH-CTR • GHOST CACHED" },
  { id: "terminal", label: "Ghost Terminal • Encrypted Uplink", icon: Terminal, path: "/clone-crush", mono: "SECURE • ENCRYPTED • MUM-01" },
];

export function CommandPaletteGhost() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || e.key === "/") {
        if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
        e.preventDefault();
        setOpen(o => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-0 max-w-[640px] overflow-hidden glass-strong border-primary/20 bg-[#0a0a0f]/90 backdrop-blur-2xl bracket">
        <div className="absolute inset-0 ghost-scanline opacity-[0.02] pointer-events-none" />
        <Command className="bg-transparent">
          <div className="flex items-center border-b border-border/40 px-3">
            <Ghost className="w-4 h-4 text-primary shrink-0 mr-2" />
            <CommandInput placeholder="Ghost Protocol • Enter command, CTR hack, or node ID... (Ctrl+K)" className="border-0 focus:ring-0 text-sm font-mono" />
            <span className="text-[9px] font-mono bg-secondary/60 border border-border/40 px-1.5 py-0.5 rounded ml-2">MUM-01</span>
          </div>
          <CommandList className="max-h-[380px] p-2">
            <CommandEmpty className="py-6 text-center text-sm text-muted-foreground font-mono">No ghost protocols found • Try 'clone', 'ghost', 'intel'</CommandEmpty>
            <CommandGroup heading="Ghost Protocols • Level 4 Clearance • MUM-01" className="text-[10px] font-mono">
              {COMMANDS.map(cmd => (
                <CommandItem
                  key={cmd.id}
                  value={cmd.label}
                  onSelect={() => { setOpen(false); navigate(cmd.path); }}
                  className="flex items-center gap-3 px-3 py-3 rounded-xl border border-transparent hover:border-primary/20 hover:bg-primary/5 data-[selected=true]:bg-primary/10 data-[selected=true]:border-primary/20 cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/15 flex items-center justify-center shrink-0"><cmd.icon className="w-4 h-4 text-primary" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{cmd.label}</p>
                    <p className="text-[10px] font-mono text-muted-foreground">{cmd.mono}</p>
                  </div>
                  <span className="text-[9px] font-mono text-muted-foreground/50 hidden md:block">↵</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="Quick Actions • Ghost Mesh" className="text-[10px] font-mono">
              <CommandItem onSelect={() => { setOpen(false); navigator.clipboard.writeText("tubeclickpro.in"); }} className="text-xs font-mono">Copy Canonical Domain • tubeclickpro.in</CommandItem>
              <CommandItem onSelect={() => {
                setOpen(false);
                // Only remove Tube Click Pro's own cache entries. Never clear
                // Supabase's persisted session or unrelated application data.
                for (let i = localStorage.length - 1; i >= 0; i -= 1) {
                  const key = localStorage.key(i);
                  if (key?.startsWith("tc-cache:")) localStorage.removeItem(key);
                }
                window.dispatchEvent(new CustomEvent("tc-cache-purged"));
              }} className="text-xs font-mono text-amber-300">Purge Local Cache • Keep Session • MUM-01</CommandItem>
            </CommandGroup>
          </CommandList>
          <div className="border-t border-border/20 px-3 py-2 flex items-center justify-between text-[9px] font-mono text-muted-foreground">
            <span className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-green-400 animate-pulse" />Ghost Protocol • 3 nodes • 87ms • Encrypted</span>
            <span>ESC to close • ↑↓ to navigate • Ghost v4.2</span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
