import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Gift, ArrowRight, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { loadReferralProfile } from "@/lib/referrals/client";
import { buildReferralUrl } from "@/lib/domain/canonical";

/**
 * Mini referral banner.
 *
 * Shown on tool pages to remind signed-in users of their referral
 * progress. Dismissible (dismissal persisted to localStorage for 24h);
 * surfaces only after the user has been on the page for several seconds
 * to avoid intruding on the initial experience.
 */

export function ViralOverdriveMiniBanner() {
  const [show, setShow] = useState(false);
  const [progress, setProgress] = useState({ invited: 0, required: 2, rewardDays: 21 });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      const lastDismiss = localStorage.getItem("ghost_mini_banner_dismiss");
      if (lastDismiss) {
        const diff = Date.now() - parseInt(lastDismiss, 10);
        if (diff < 24 * 60 * 60 * 1000) return; // dismissed within 24h
      }
    } catch {}

    const load = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) return;
        const profile = await loadReferralProfile();
        const invited = Math.min(profile.qualifiedReferrals, profile.requiredForReward);
        if (!profile.proActive) {
          setProgress({ invited, required: profile.requiredForReward, rewardDays: profile.rewardDays });
          setShow(true);
        }
      } catch {}
    };
    // Show after 8s - not intrusive
    const t = setTimeout(load, 8000);
    return () => clearTimeout(t);
  }, []);

  const dismiss = () => {
    try { localStorage.setItem("ghost_mini_banner_dismiss", Date.now().toString()); } catch {}
    setDismissed(true);
    setShow(false);
  };

  if (!show || dismissed) return null;

  return (
    <div className="viral-mini-banner relative overflow-hidden rounded-xl border border-amber-500/20 bg-gradient-to-r from-amber-500/10 via-card/80 to-primary/10 backdrop-blur-xl p-3 flex items-center justify-between gap-3 animate-fade-in">
      <div className="absolute inset-0 ghost-scanline opacity-[0.02] pointer-events-none" />
      <div className="flex items-center gap-3 min-w-0 relative z-10">
        <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/20 flex items-center justify-center shrink-0">
          <Gift className="w-4 h-4 text-amber-400 animate-pulse" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-mono font-bold text-foreground">Ghost Uplink Progress • {progress.invited}/{progress.required} qualified • {progress.rewardDays}d Pro • $97→₹0</p>
          <p className="text-[10px] font-mono text-muted-foreground">Establish uplink via <span className="text-cyan-300">tubeclickpro.in/ref/...?clearance=LEVEL4</span> • Private tracker • MUM-01</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0 relative z-10">
        <Link to="/rewards" className="hidden md:inline-flex items-center gap-1 rounded-full bg-primary text-primary-foreground px-3 py-1.5 text-[11px] font-mono font-bold hover:bg-primary/90 transition-colors">
          Open War Room <ArrowRight className="w-3 h-3" />
        </Link>
        <button onClick={dismiss} className="w-6 h-6 rounded-full bg-secondary/60 border border-border/40 flex items-center justify-center hover:bg-destructive/20 transition-colors">
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
