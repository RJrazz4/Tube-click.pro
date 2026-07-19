import { useState, useEffect } from "react";
import { Zap, Sparkles, AlertTriangle, ShieldCheck, CreditCard, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/useAuthStore";
import { cn } from "@/lib/utils";

export function SmartGeoPaymentModal() {
  const { upgradeModalOpen, setUpgradeModalOpen, upgradeTier } = useAuthStore();
  
  // Auto-detect country/region using browser timezone
  const defaultRegion = typeof Intl !== "undefined" && 
                        (Intl.DateTimeFormat().resolvedOptions().timeZone.includes("Calcutta") || 
                         Intl.DateTimeFormat().resolvedOptions().timeZone.includes("Asia") ||
                         Intl.DateTimeFormat().resolvedOptions().timeZone.includes("Indian")) 
                        ? "IN" : "US";
                        
  const [countryRegion, setCountryRegion] = useState<"US" | "IN">(defaultRegion);

  // Sync region default when modal opens
  useEffect(() => {
    if (upgradeModalOpen) {
      setCountryRegion(defaultRegion);
    }
  }, [upgradeModalOpen, defaultRegion]);

  const handleExecuteSubscription = () => {
    upgradeTier("pro");
    setUpgradeModalOpen(false);
    toast.success("Welcome to Premium Plan! Unlimited Cinematic Voiceovers and 90% Stealth Disguise unlocked.");
  };

  const handleExecuteGodMode = () => {
    upgradeTier("pro"); // Unlocks all pro features
    setUpgradeModalOpen(false);
    toast.success("⚡️ GOD MODE ACTIVATED! Enjoy 7 days of 90% Stealth Clones and Neural Speech.", {
      icon: "🔥",
      duration: 6000
    });
  };

  return (
    <Dialog open={upgradeModalOpen} onOpenChange={setUpgradeModalOpen}>
      <DialogContent className="cyber-card bg-card/95 border-border/80 max-w-md p-6 relative z-[100] shadow-[0_0_50px_rgba(0,0,0,0.9)]">
        <DialogHeader className="text-center pb-2">
          <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center mx-auto mb-3 border border-primary/20">
            <Zap className="w-6 h-6 text-primary fill-primary animate-pulse" />
          </div>
          <DialogTitle className="text-lg md:text-xl font-display font-bold text-foreground">
            Complete Premium Activation
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Configure your secure checkout via our global billing channels.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-3">
          {/* Country/Region Toggle */}
          <div className="space-y-2 p-3 bg-secondary/40 rounded-xl border border-border/50">
            <div className="flex justify-between items-center">
              <Label className="text-xs text-muted-foreground font-semibold">Billing Region</Label>
              <span className="text-[10px] bg-primary/20 text-primary font-mono px-2 py-0.5 rounded font-bold">
                {countryRegion === "IN" ? "🇮🇳 India Detected" : "🌐 Global (USD)"}
              </span>
            </div>
            
            <div className="grid grid-cols-2 gap-2 mt-2">
              <button
                type="button"
                onClick={() => setCountryRegion("US")}
                className={cn(
                  "py-1.5 rounded-lg border text-xs font-semibold transition-all",
                  countryRegion === "US"
                    ? "bg-primary/10 border-primary text-primary shadow-sm"
                    : "bg-transparent border-border/60 text-muted-foreground hover:border-border"
                )}
              >
                Global / USA ($)
              </button>
              <button
                type="button"
                onClick={() => setCountryRegion("IN")}
                className={cn(
                  "py-1.5 rounded-lg border text-xs font-semibold transition-all",
                  countryRegion === "IN"
                    ? "bg-primary/10 border-primary text-primary shadow-sm"
                    : "bg-transparent border-border/60 text-muted-foreground hover:border-border"
                )}
              >
                India (₹)
              </button>
            </div>
          </div>

          {/* Price Details Block */}
          <div className="p-4 bg-secondary/20 rounded-xl border border-border/40 space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Premium Access Plan:</span>
              <span className="text-foreground font-medium">Monthly Creator pass</span>
            </div>
            <div className="flex justify-between items-baseline pt-1.5 border-t border-border/20">
              <span className="text-sm font-bold text-foreground">Total to Pay:</span>
              <span className="text-lg font-display font-bold text-primary">
                {countryRegion === "IN" ? "₹1,599 / month" : "$19.00 / month"}
              </span>
            </div>
          </div>

          {/* Primary Checkout Trigger Button */}
          <div className="space-y-3">
            {countryRegion === "IN" ? (
              <Button 
                onClick={handleExecuteSubscription}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-display font-bold uppercase tracking-wider text-xs h-11 flex items-center justify-center gap-1.5 shadow-sm"
              >
                Pay via UPI / Cards (Razorpay) 🇮🇳
              </Button>
            ) : (
              <Button 
                onClick={handleExecuteSubscription}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-display font-bold uppercase tracking-wider text-xs h-11 flex items-center justify-center gap-1.5 shadow-sm"
              >
                Pay via Credit Card (Stripe) 🌐
              </Button>
            )}

            {/* HIGH-CONVERSION ₹99 "GOD MODE" SECONDARY TRIGGER */}
            <div className="relative group overflow-hidden rounded-xl border-2 border-dashed border-primary/50 bg-primary/5 hover:bg-primary/10 transition-all duration-300 p-3.5 cursor-pointer" onClick={handleExecuteGodMode}>
              <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-[8px] font-bold px-2 py-0.5 rounded-bl font-display tracking-wider uppercase">
                Best Offer
              </div>
              <div className="flex items-start gap-2.5">
                <Sparkles className="w-5 h-5 text-primary shrink-0 mt-0.5 animate-pulse" />
                <div className="space-y-1 text-left">
                  <p className="text-xs font-bold text-foreground flex items-center gap-1">
                    ⚡️ UNLOCK GOD MODE — JUST {countryRegion === "IN" ? "₹99" : "$1.19"}
                  </p>
                  <p className="text-[10px] font-semibold text-primary">
                    🔥 7 Days. FULL POWER. ONE-TIME ACCESS.
                  </p>
                  <p className="text-[9px] text-muted-foreground leading-tight">
                    No auto-pay. Experience the full 90% Stealth Disguise engine and unlimited speech characters for a week.
                  </p>
                </div>
              </div>
            </div>

            <Button 
              variant="ghost" 
              onClick={() => setUpgradeModalOpen(false)}
              className="w-full text-xs text-muted-foreground hover:text-foreground h-9"
            >
              Cancel Transactions
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
