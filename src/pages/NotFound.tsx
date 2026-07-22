import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Terminal, Cpu, Ghost, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VideoWallBackground } from "@/components/ui/VideoWallBackground";

const NotFound = () => {
  const location = useLocation();
  useEffect(() => {
    console.error("404 Ghost Tunnel: User attempted non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="relative flex min-h-[60vh] items-center justify-center overflow-hidden rounded-2xl">
      <VideoWallBackground intensity="medium" />
      <div className="absolute inset-0 bg-[#020207]/80" />
      <div className="absolute inset-0 ghost-scanline opacity-[0.02] pointer-events-none" />
      <div className="relative z-10 text-center p-8 glass-strong border-primary/20 rounded-2xl bracket max-w-md">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4">
          <Ghost className="w-8 h-8 text-red-400" />
        </div>
        <h1 className="font-display text-4xl font-black text-foreground">404 • Ghost Tunnel Lost</h1>
        <p className="mt-3 text-sm font-mono text-muted-foreground">Route <span className="text-cyan-300">{location.pathname}</span> not found in ghost mesh • MUM-01 • Encrypted uplink failed • Re-routing to secure domain tubeclickpro.in</p>
        <div className="mt-4 flex items-center justify-center gap-2 text-[10px] font-mono">
          <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 text-primary border border-primary/20"><Terminal className="w-3 h-3" />404 • GHOST</span>
          <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-green-500/10 text-green-400 border border-green-500/20"><Cpu className="w-3 h-3" />MUM-01 • 87ms</span>
        </div>
        <Link to="/" className="mt-6 inline-block"><Button className="cyber-button gap-2 font-mono text-xs"><ArrowRight className="w-4 h-4" />Return to Ghost War Room • tubeclickpro.in</Button></Link>
      </div>
    </div>
  );
};

export default NotFound;
