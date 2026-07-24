import { CheckCircle2, Circle, ShieldCheck, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ReferralProfile } from "@/lib/referrals/client";

export function ReferralMilestones({ profile }: { profile: ReferralProfile }) {
  const milestones = [
    { label: "Create your referral link", detail: "Your canonical link is ready to share.", complete: Boolean(profile.referralCode) },
    { label: "Invite your first creator", detail: "A visitor opens your link.", complete: profile.totalInvites >= 1 },
    { label: "Complete 3 verified referrals", detail: "Verified referrals count toward the qualification loop.", complete: profile.verifiedReferrals >= 3 },
    { label: "Unlock your Pro pass", detail: "Eligibility and expiry are shown in this dashboard.", complete: profile.qualified || Boolean(profile.proTierExpiresAt) },
  ];
  return <Card className="glass-strong border-border/70"><CardHeader className="pb-3"><CardTitle className="font-display text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-cyan-300" />Referral progression</CardTitle><p className="text-xs text-muted-foreground">Transparent milestones. No hidden conditions or fabricated activity.</p></CardHeader><CardContent className="space-y-3">{milestones.map((milestone, index) => <div key={milestone.label} className="flex items-start gap-3"><div className="mt-0.5">{milestone.complete ? <CheckCircle2 className="h-4 w-4 text-green-400" /> : <Circle className="h-4 w-4 text-muted-foreground/50" />}</div><div className="min-w-0"><p className={`text-sm font-medium ${milestone.complete ? "text-foreground" : "text-muted-foreground"}`}>{index + 1}. {milestone.label}</p><p className="text-[11px] text-muted-foreground">{milestone.detail}</p></div>{milestone.complete && <Sparkles className="ml-auto h-3.5 w-3.5 text-amber-300" />}</div>)}</CardContent></Card>;
}
