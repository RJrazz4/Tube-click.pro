import { useEffect, useState } from "react";
import { Gift, Loader2, Terminal, Cpu } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { Card, CardContent } from "@/components/ui/card";
import { captureReferralClick } from "@/lib/referrals/client";
import { getCanonicalRoot, isTemporaryHost } from "@/lib/domain/canonical";

export default function ReferralCapture() {
  const { code = "" } = useParams();
  const navigate = useNavigate();
  const [message, setMessage] = useState("Establishing ghost uplink via MUM-01... Activating private tracker perk");
  const [logs, setLogs] = useState<string[]>(["> GHOST PROTOCOL v4.2 • BOOT", "> DETECTING REFERRAL CODE..."]);

  useEffect(() => {
    let active = true;
    const capture = async () => {
      try {
        // Add boot logs - lightweight illusion
        setLogs(l => [...l, `> CODE: ${code.toUpperCase()} • LEVEL 4 CLEARANCE`, "> QUANTUM CACHE CHECK • MUM-01..."]);

        // If on temporary host, capture still works but remind canonical
        try {
          const host = window.location.hostname;
          if (isTemporaryHost(host)) {
            setLogs(l => [...l, `> TEMP HOST DETECTED (${host}) • CANONICAL ENFORCED`, `> SECURE ROOT: ${getCanonicalRoot()}`]);
          }
        } catch {}

        await captureReferralClick(code);
        if (active) {
          setLogs(l => [...l, "> GHOST UPLINK SECURED • QUANTUM CACHE SYNCED ✓", "> ENCRYPTED TUNNEL • TUBECCLICKPRO.IN"]);
          setMessage("Ghost uplink secured via MUM-01. Private tracker perk activated. Redirecting to war room...");
        }
      } catch {
        if (active) {
          setLogs(l => [...l, "> GHOST RELAY: CODE INVALID OR EXPIRED • RE-ROUTING", "> FALLBACK TO SECURE DOMAIN"]);
          setMessage("This ghost link is invalid or expired. Rerouting via secure domain tubeclickpro.in...");
        }
      } finally {
        window.setTimeout(() => {
          if (active) navigate("/", { replace: true });
        }, 1600);
      }
    };
    void capture();
    return () => { active = false; };
  }, [code, navigate]);

  return (
    <div className="flex min-h-[65vh] items-center justify-center relative">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 bg-[#020207]" />
        <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-primary/10 blur-[60px]" />
        <div className="absolute inset-0 ghost-scanline opacity-[0.03]" />
      </div>
      <Card className="relative z-10 w-full max-w-lg glass-strong border-primary/25 text-center shadow-[0_0_40px_rgba(139,92,246,0.15)] bracket">
        <CardContent className="flex flex-col items-center gap-4 p-8">
          <div className="relative rounded-2xl bg-primary/10 p-4 border border-primary/15">
            <Gift className="h-8 w-8 text-primary" />
            <Loader2 className="absolute -right-2 -top-2 h-5 w-5 animate-spin text-cyan-400" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold flex items-center justify-center gap-2"><Terminal className="w-4 h-4 text-primary" />Ghost Uplink • Level 4</h1>
            <p className="mt-2 text-sm text-muted-foreground font-mono">{message}</p>
          </div>
          <div className="w-full text-left rounded-xl bg-black/70 border border-primary/15 p-3 font-mono text-[10px] space-y-1">
            {logs.map((log, i) => (
              <div key={i} className="text-cyan-300/80">{log} {i === logs.length - 1 && <span className="inline-block w-1 h-3 bg-cyan-400 ml-1 animate-pulse translate-y-[2px]" />}</div>
            ))}
            <div className="flex items-center gap-2 pt-2 mt-2 border-t border-border/20">
              <Cpu className="w-3 h-3 text-green-400 animate-pulse" />
              <span className="text-[9px] text-muted-foreground">MUM-01 • 87ms • tubeclickpro.in • Quantum cached • Encrypted</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
