import { useEffect, useRef, useState } from "react";
import { isTemporaryHost, getCanonicalRoot } from "@/lib/domain/canonical";

/**
 * Canonical-domain redirect overlay.
 *
 * If the user lands on a temporary host (Vercel preview / Netlify deploy),
 * we IMMEDIATELY replace the location to tubeclickpro.in. The overlay is a
 * <300ms flash that tells the user what's happening — it NEVER traps them
 * behind a countdown. The redirect fires on a microtask (no 3s delay), uses
 * window.location.replace (history-safe, no back-button trap), and exposes a
 * manual "Reroute Now" button as an absolute escape hatch.
 */

const AUTH_ROUTES = ["/auth/callback", "/auth/"];

function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTES.some(route => pathname === route || pathname.startsWith(route));
}

function triggerCanonicalRedirect() {
  try {
    const canonical = getCanonicalRoot();
    const path = window.location.pathname + window.location.search + window.location.hash;
    const target = `${canonical}${path}`;
    // replace() avoids polluting history so the back button can't land the
    // user on a trapped preview URL after they've been routed.
    window.location.replace(target);
    // Belt-and-suspenders: some sandboxed previews swallow replace(). Fall
    // back to href + reload 50ms later if we're still on the same host.
    window.setTimeout(() => {
      if (isTemporaryHost(window.location.hostname)) {
        window.location.href = target;
      }
    }, 50);
  } catch {
    // Last resort — hard navigation to root of canonical domain.
    try { window.location.replace(getCanonicalRoot()); } catch { /* unrecoverable */ }
  }
}

export function GhostRedirectOverlay() {
  const [show, setShow] = useState(false);
  const firedRef = useRef(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      const host = window.location.hostname;
      const pathname = window.location.pathname;

      if (isAuthRoute(pathname)) return;
      if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost")) return;
      if (!isTemporaryHost(host) || host.includes("tubeclickpro.in")) return;

      setShow(true);

      // If StrictMode double-invokes the effect, or React unmounts/remounts,
      // we must NOT re-arm a second timer. Fired once = leaving the page.
      if (firedRef.current) return;
      firedRef.current = true;

      // Fire the redirect on the next microtask — the overlay paints a single
      // frame so the user sees the "SECURE DOMAIN REDIRECT" notice, then the
      // browser navigates. No 3-second countdown trap.
      timeoutRef.current = window.setTimeout(() => {
        triggerCanonicalRedirect();
      }, 0);
    } catch {}

    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-[#020207]/92 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl glass-strong border-primary/20 p-6 text-center space-y-4 bracket">
        <div className="w-12 h-12 mx-auto rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
        </div>
        <div>
          <h2 className="font-display font-bold text-foreground">SECURE DOMAIN REDIRECT</h2>
          <p className="text-xs font-mono text-muted-foreground mt-2">Temporary deployment detected • Rerouting to canonical secure domain via ghost relay</p>
          <p className="text-[11px] font-mono text-cyan-300 mt-2 bg-black/40 border border-cyan-400/20 rounded-lg px-3 py-2">Vercel → tubeclickpro.in • Encrypted • MUM-01</p>
        </div>
        <button
          type="button"
          onClick={triggerCanonicalRedirect}
          className="cyber-button w-full h-10 text-xs font-display tracking-wide"
        >
          Reroute Now → tubeclickpro.in
        </button>
        <div className="flex justify-center gap-1">
          {[0,1,2].map(i => <span key={i} className="w-1 h-1 rounded-full bg-primary/60 animate-pulse" style={{ animationDelay: `${i*200}ms` }} />)}
        </div>
        <p className="text-[9px] font-mono text-muted-foreground/60">Ghost Protocol • Always tubeclickpro.in • Your referral remains safe in quantum cache</p>
      </div>
    </div>
  );
}
