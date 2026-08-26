import { Link } from "react-router-dom";
import { Terminal, Cpu, ShieldCheck, Radio } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-primary/10 glass-strong backdrop-blur-xl relative overflow-hidden">
      <div className="absolute inset-0 ghost-scanline opacity-[0.01] pointer-events-none" />
      <div className="max-w-7xl mx-auto px-6 py-6 relative z-10">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <p className="text-sm text-muted-foreground font-mono text-xs">© {new Date().getFullYear()} TubeClick Pro • tubeclickpro.in</p>
            <div className="hidden md:flex items-center gap-2 text-[10px] font-mono">
              <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-green-500/10 text-green-400 border border-green-500/20"><span className="w-1 h-1 rounded-full bg-green-400 animate-pulse" />All systems operational</span>
              
              
            </div>
          </div>
          <nav className="flex items-center gap-4">
            <Link to="/privacy" className="text-xs font-mono text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"><ShieldCheck className="w-3 h-3" />Privacy</Link>
            <Link to="/terms" className="text-xs font-mono text-muted-foreground hover:text-foreground transition-colors">Terms • Level 4</Link>
            <Link to="/about" className="text-xs font-mono text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"><Terminal className="w-3 h-3" />About • War Room</Link>
          </nav>
        </div>
        <div className="mt-4 pt-4 border-t border-border/20 flex flex-col md:flex-row items-center justify-between gap-2 text-[9px] font-mono text-muted-foreground/50">
          <span>TubeClick Pro — creator intelligence, honest pricing, real results.</span>
          <span className="hidden md:inline">Refer friends to earn Pro free — no card required</span>
        </div>
      </div>
    </footer>
  );
}
