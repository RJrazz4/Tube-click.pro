/**
 * Central "Pro Upgrade" modal.
 *
 * Replaces the legacy behaviour of force-redirecting every "Unlock Pro" click
 * to the /rewards referral page. Instead it presents a clean choice:
 *   • Payment  — interactive USDT / UPI checkout (PaymentCheckout)
 *   • Referral — free "Ghost Uplink" unlock, gated to NEW users + ONE-TIME only
 *
 * Rendered once at the app root via ProUpgradeProvider.
 */
import { useEffect, useState } from "react";
import { Gift, Lock, CreditCard, Sparkles, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { PaymentCheckout } from "./PaymentCheckout";
import { ReferralApplyForm } from "@/components/referrals/ReferralApplyForm";
import { useProUpgrade, type ProUpgradeTab } from "@/contexts/ProUpgradeContext";
import { useSoftGate } from "@/contexts/SoftGateContext";
import { useFreeUnlockEligibility, markFreeUnlockUsed } from "@/lib/referrals/freeUnlockGuard";
import { loadReferralProfile } from "@/lib/referrals/client";
import { useAuthStore } from "@/stores/useAuthStore";

export function ProUpgradeModal() {
  const { isOpen, defaultTab, closeProUpgrade } = useProUpgrade();
  const { isAuthenticated, requestAuthentication } = useSoftGate();
  const [serverUsed, setServerUsed] = useState<boolean | undefined>(undefined);
  const eligibility = useFreeUnlockEligibility(serverUsed);
  const userId = useAuthStore((s) => s.user?.id);

  const [tab, setTab] = useState<ProUpgradeTab>(defaultTab);

  // Sync the initial tab every time the modal opens.
  useEffect(() => {
    if (isOpen) setTab(defaultTab);
  }, [isOpen, defaultTab]);

  // Cross-check the authoritative one-time ledger on the server whenever the
  // modal opens for a signed-in user. Clears localStorage re-arms are blocked.
  useEffect(() => {
    if (!isOpen || !isAuthenticated) {
      setServerUsed(undefined);
      return;
    }
    let active = true;
    loadReferralProfile()
      .then((profile) => {
        if (active) setServerUsed(profile.freeUnlockUsed);
      })
      .catch(() => {
        if (active) setServerUsed(undefined);
      });
    return () => {
      active = false;
    };
  }, [isOpen, isAuthenticated]);

  const handleReferralApplied = () => {
    markFreeUnlockUsed(userId);
    toastOk();
  };

  if (!isOpen) return null;

  const goPayment = () => setTab("payment");

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeProUpgrade()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto border-primary/30 bg-card/95 p-0 shadow-[0_0_70px_rgba(139,92,246,0.22)] sm:max-w-[560px]">
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
        <DialogHeader className="relative border-b border-border/60 bg-gradient-to-br from-primary/10 via-transparent to-cyan-400/5 p-6 pb-5">
          <DialogTitle className="font-display text-2xl font-black">Upgrade to Pro</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            Choose how you want to unlock. Pay once, or use the free Ghost Uplink (new accounts only).
          </DialogDescription>
        </DialogHeader>

        <div className="relative p-5 sm:p-6">
          <Tabs value={tab} onValueChange={(v) => setTab(v as ProUpgradeTab)}>
            <TabsList className="grid w-full grid-cols-2 bg-secondary/70">
              <TabsTrigger value="payment" className="gap-2">
                <CreditCard className="h-4 w-4" /> Payment
              </TabsTrigger>
              <TabsTrigger value="referral" className="gap-2" disabled={!eligibility.eligible}>
                <Gift className="h-4 w-4" /> Free Unlock
              </TabsTrigger>
            </TabsList>

            {/* ---------------- PAYMENT ---------------- */}
            <TabsContent value="payment" className="mt-5">
              <PaymentCheckout />
            </TabsContent>

            {/* ---------------- REFERRAL / FREE UNLOCK ---------------- */}
            <TabsContent value="referral" className="mt-5">
              {eligibility.eligible ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.08] to-cyan-400/[0.04] p-4">
                    <div className="flex items-center gap-2 text-primary">
                      <Sparkles className="h-4 w-4" />
                      <span className="font-display font-bold">Free Unlock via Ghost Uplink</span>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                      New here? Apply a friend&apos;s referral code below. When your inviter hits their
                      milestone, your Pro pass activates automatically — no card, no checkout.{" "}
                      <span className="font-semibold text-foreground">One-time only.</span>
                    </p>
                  </div>
                  <ReferralApplyForm onApplied={handleReferralApplied} />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-start gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] p-4">
                    <Lock className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
                    <div>
                      <p className="font-display font-bold text-amber-200">Free unlock unavailable</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{eligibility.message}</p>
                    </div>
                  </div>
                  <Button onClick={goPayment} className="cyber-button h-11 w-full gap-2">
                    <CreditCard className="h-4 w-4" /> Continue with Payment
                  </Button>
                </div>
              )}
            </TabsContent>
          </Tabs>

          {!isAuthenticated && (
            <div className="mt-5 flex items-center justify-between rounded-xl border border-border/60 bg-secondary/30 px-4 py-3">
              <p className="text-xs text-muted-foreground">Sign in to track your Pro activation.</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void requestAuthentication("unlock Pro")}
                className="shrink-0"
              >
                Sign In
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function toastOk() {
  // Imported lazily to avoid a circular import at module top.
  import("sonner").then(({ toast }) =>
    toast.success("Referral code applied — your free unlock is on its way!"),
  );
}
