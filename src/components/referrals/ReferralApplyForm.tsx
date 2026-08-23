import { useState } from "react";
import { Check, Loader2, TicketPercent } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Manual referral application (event-driven flow).
 *
 * A user pastes someone else's referral code and presses Apply. This POSTs to
 * the AI Manager bot's referral endpoint (Render), which authenticates the
 * caller, validates the code, increments the referrer's count, and — on the
 * milestone — grants the referrer a 21-day Pro trial + alerts the admin.
 */
const REFERRAL_API_URL = import.meta.env.VITE_REFERRAL_API_URL || "";

type Status = "idle" | "submitting" | "success";

export function ReferralApplyForm({ onApplied }: { onApplied?: () => void } = {}) {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  const apply = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;

    if (!REFERRAL_API_URL) {
      toast.error("Referral service is not configured (VITE_REFERRAL_API_URL).");
      return;
    }

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      toast.error("You need to be signed in to apply a referral code.");
      return;
    }

    setStatus("submitting");
    try {
      const res = await fetch(`${REFERRAL_API_URL}/api/referral/apply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code: trimmed }),
      });

      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; granted?: boolean };

      if (res.ok && body.ok) {
        setStatus("success");
        toast.success(body.granted ? "Code applied — the referrer hit their milestone! 🎉" : "Referral code applied.");
        onApplied?.();
      } else if (res.status === 404) {
        toast.error("That referral code is invalid.");
      } else if (res.status === 409) {
        toast.error("You've already applied a referral code.");
      } else if (res.status === 400 && body.error === "self_referral") {
        toast.error("You can't apply your own referral code.");
      } else {
        toast.error("Could not apply the code — please try again.");
      }
    } catch {
      toast.error("Could not reach the referral service.");
    } finally {
      setStatus("idle");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <TicketPercent className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Enter a referral code (e.g. TC_ABC1234)"
            disabled={status !== "idle"}
            spellCheck={false}
            autoComplete="off"
            className="pl-9 font-mono uppercase"
            onKeyDown={(e) => {
              if (e.key === "Enter" && status === "idle") void apply();
            }}
          />
        </div>
        <Button
          onClick={() => void apply()}
          disabled={!code.trim() || status !== "idle"}
          className="cyber-button shrink-0"
        >
          {status === "submitting" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Applying…
            </>
          ) : status === "success" ? (
            <>
              <Check className="h-4 w-4" /> Applied
            </>
          ) : (
            "Apply"
          )}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Applying a friend's code earns them progress toward a Pro trial.
      </p>
    </div>
  );
}
