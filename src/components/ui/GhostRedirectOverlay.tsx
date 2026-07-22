import { useEffect, useState } from "react";
import { isTemporaryHost, getCanonicalRoot } from "@/lib/domain/canonical";

/**
 * Ghost Redirect Overlay - If user lands on vercel.app, auto-redirect to tubeclickpro.in
 * Premium illusion: "REDIRECTING TO SECURE DOMAIN" terminal
 */

export function GhostRedirectOverlay() {
  const [show, setShow] = useState(false);
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    try {
      const host = window.location.hostname;
      if (isTemporaryHost(host) && !host.includes("tubeclickpro.in")) {
        setShow(true);
        const interval = setInterval(() => setCountdown(c => c - 1), 1000);
        const timeout = setTimeout(() => {
          const canonical = getCanonicalRoot();
          const path = window.location.pathname + window.location.search + window.location.hash;
          window.location.href = `${canonical}${path}`;
        }, 3200);
        return () => { clearInterval(interval); clearTimeout(timeout); };
      }
    } catch {}
  }, []);

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-[#020207]/90 backdrop-blur-xl flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl glass-strong border-primary/20 p-6 text-center space-y-4 bracket">
        <div className="w-12 h-12 mx-auto rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
        </div>
        <div>
          <h2 className="font-display font-bold text-foreground">SECURE DOMAIN REDIRECT</h2>
          <p className="text-xs font-mono text-muted-foreground mt-2">Temporary deployment detected • Rerouting to canonical secure domain via ghost relay</p>
          <p className="text-[11px] font-mono text-cyan-300 mt-2 bg-black/40 border border-cyan-400/20 rounded-lg px-3 py-2">Vercel → tubeclickpro.in • Encrypted • MUM-01 • {countdown}s</p>
        </div>
        <div className="flex justify-center gap-1">
          {[0,1,2].map(i => <span key={i} className="w-1 h-1 rounded-full bg-primary/60 animate-pulse" style={{ animationDelay: `${i*200}ms` }} />)}
        </div>
        <p className="text-[9px] font-mono text-muted-foreground/60">Ghost Protocol • Always tubeclickpro.in • Your referral remains safe in quantum cache</p>
      </div>
    </div>
  );
}
