/**
 * ProActivationModal — the ONE route to FREE Pro (Round 4, owner amendment).
 *
 * In FREE_PRO_MODE, Pro activates only after the user submits the
 * Professional Details lead form. Reachable from every locked gate (via the
 * ProUpgradeModal free state), the Settings subscription surface, the
 * dashboard activation banner, and the EntitlementStatus CTA.
 *
 * Owner's exact field list: phone number, email (prefilled from the account,
 * editable), location/address (text), online earning (range select + optional
 * exact), physical earning (range select + optional exact).
 */
import { useCallback, useEffect, useState } from "react";
import { create } from "zustand";
import { Sparkles, Loader2, Users } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/useAuthStore";
import {
  INCOME_RANGES,
  loadReferrerCode,
  saveLeadDetails,
  validateLeadForm,
  type LeadDetailsFormInput,
} from "@/lib/leads/leadDetails";

interface ProActivationState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const useProActivation = create<ProActivationState>()((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));

/** Opens the Professional Details activation form from anywhere. */
export const openProActivation = () => useProActivation.getState().open();

const inputCls = "bg-secondary/60";

export function ProActivationModal() {
  const { isOpen, close } = useProActivation();
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const leadSubmitted = useAuthStore((s) => s.leadSubmitted);
  const setLeadSubmitted = useAuthStore((s) => s.setLeadSubmitted);

  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [location, setLocation] = useState("");
  const [onlineIncome, setOnlineIncome] = useState("");
  const [onlineIncomeExact, setOnlineIncomeExact] = useState("");
  const [physicalIncome, setPhysicalIncome] = useState("");
  const [physicalIncomeExact, setPhysicalIncomeExact] = useState("");
  const [referrerCode, setReferrerCode] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Prefill email from the account each time the modal opens; reset the form.
  useEffect(() => {
    if (!isOpen) return;
    setPhone("");
    setEmail(user?.email ?? "");
    setLocation("");
    setOnlineIncome("");
    setOnlineIncomeExact("");
    setPhysicalIncome("");
    setPhysicalIncomeExact("");
    setErrors([]);
    setSubmitting(false);
    setReferrerCode(null);
    void loadReferrerCode().then(setReferrerCode).catch(() => undefined);
  }, [isOpen, user?.email]);

  const handleSubmit = useCallback(async () => {
    if (submitting) return;
    const input: LeadDetailsFormInput = {
      phone,
      email,
      location,
      onlineIncome,
      onlineIncomeExact,
      physicalIncome,
      physicalIncomeExact,
    };
    const validation = validateLeadForm(input);
    if (validation.length > 0) {
      setErrors(validation);
      return;
    }
    setSubmitting(true);
    try {
      const result = await saveLeadDetails(input);
      if (!result.ok) {
        setErrors(["Something went wrong saving your details. Please try again."]);
        return;
      }
      setLeadSubmitted(true);
      close();
      toast.success("Professional details saved — your FREE Pro is active! 🎉");
    } finally {
      setSubmitting(false);
    }
  }, [submitting, phone, email, location, onlineIncome, onlineIncomeExact, physicalIncome, physicalIncomeExact, setLeadSubmitted, close]);

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto border-primary/30 bg-card/95 p-0 sm:max-w-[520px]">
        <DialogHeader className="border-b border-border/60 bg-gradient-to-br from-primary/10 via-transparent to-cyan-400/5 p-6 pb-5">
          <DialogTitle className="font-display text-xl font-black">
            {leadSubmitted ? "Your details" : "Activate your FREE Pro"}
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            {leadSubmitted
              ? "Your professional details are on file — Pro stays active."
              : "Complete your professional details once. This activates every Pro tool — free, forever during the launch period."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 p-6">
          {referrerCode && (
            <p className="flex items-center gap-2 rounded-lg border border-cyan-400/20 bg-cyan-400/[0.05] px-3 py-2 text-[11px] text-cyan-300">
              <Users className="h-3.5 w-3.5" /> Referred by {referrerCode} — your inviter gets credit for this signup.
            </p>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="lead-phone">Phone number *</Label>
              <Input id="lead-phone" type="tel" inputMode="tel" placeholder="+91 98XXXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lead-email">Email *</Label>
              <Input id="lead-email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lead-location">Location / Address *</Label>
            <Input id="lead-location" type="text" placeholder="City, State" value={location} onChange={(e) => setLocation(e.target.value)} className={inputCls} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="lead-online">Online earning *</Label>
              <Select value={onlineIncome} onValueChange={setOnlineIncome}>
                <SelectTrigger id="lead-online" className={inputCls}>
                  <SelectValue placeholder="Select range" />
                </SelectTrigger>
                <SelectContent>
                  {INCOME_RANGES.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input type="text" inputMode="decimal" placeholder="Exact amount (optional)" value={onlineIncomeExact} onChange={(e) => setOnlineIncomeExact(e.target.value)} className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lead-physical">Physical earning *</Label>
              <Select value={physicalIncome} onValueChange={setPhysicalIncome}>
                <SelectTrigger id="lead-physical" className={inputCls}>
                  <SelectValue placeholder="Select range" />
                </SelectTrigger>
                <SelectContent>
                  {INCOME_RANGES.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input type="text" inputMode="decimal" placeholder="Exact amount (optional)" value={physicalIncomeExact} onChange={(e) => setPhysicalIncomeExact(e.target.value)} className={inputCls} />
            </div>
          </div>

          {errors.length > 0 && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
              {errors.map((e) => (
                <p key={e} className="text-xs text-red-300">• {e}</p>
              ))}
            </div>
          )}

          {!isAuthenticated && (
            <p className="text-xs text-muted-foreground">Sign in first — your details are saved to your account.</p>
          )}

          <Button
            onClick={() => void handleSubmit()}
            disabled={submitting || !isAuthenticated}
            className="cyber-button h-11 w-full gap-2"
          >
            {submitting ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
            ) : (
              <><Sparkles className="h-4 w-4" /> Activate my FREE Pro</>
            )}
          </Button>
          <p className="text-center text-[10px] text-muted-foreground">
            We use these details to tailor your creator tools. No spam, ever.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
