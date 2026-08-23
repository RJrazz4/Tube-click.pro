/**
 * Interactive Payment Checkout for TubeClick Pro.
 *
 * Flow (per product spec):
 *   1. User FIRST selects a payment method — USDT or UPI.
 *   2. ONLY after a method is chosen do the respective payment details
 *      (QR code, wallet address, or UPI ID) dynamically appear.
 *   3. Within UPI, the user also picks a plan (Full ₹860 / Mini ₹400); the
 *      UPI QR (which encodes the amount) is generated for the chosen plan.
 *   4. User pays externally, then pastes the proof (TxID for USDT, UTR/ref
 *      for UPI) and submits. Verification is client-side / manual.
 *
 * Reuses the app's glass + cyber aesthetic and the `qrcode.react` lib already
 * used by CryptoCheckout.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Check,
  Copy,
  CreditCard,
  Loader2,
  ShieldCheck,
  TriangleAlert,
  Wallet,
  IndianRupee,
  ScanLine,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { UsdtLogo } from "./UsdtLogo";
import { useSoftGate } from "@/contexts/SoftGateContext";
import { supabase } from "@/integrations/supabase/client";
import {
  PLANS,
  USDT_WALLET_ADDRESS,
  UPI_ID,
  UPI_PAYEE_NAME,
  PAYMENT_VERIFY_URL,
  IS_UPI_CONFIGURED,
  IS_USDT_CONFIGURED,
  USDT_GASFREE_WARNING,
  buildUpiIntent,
  plansForMethod,
  type PaymentMethod,
  type Plan,
  type PlanId,
} from "@/lib/monetization/pricing";

const USDT_DEPOSIT_NETWORK = "TRON (TRC-20)";

function isValidTxId(tx: string): boolean {
  return /^(0x)?[0-9a-fA-F]{64}$/.test(tx.trim());
}

/* --------------------------------------------------------------- component */

export function PaymentCheckout({ onSuccess }: { onSuccess?: () => void }) {
  const { isAuthenticated } = useSoftGate();

  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<PlanId>("upi_full");
  const [proof, setProof] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [copied, setCopied] = useState<"addr" | "upi" | null>(null);

  // Reset dependent state whenever the payment method changes.
  useEffect(() => {
    setSelectedPlan(method === "upi" ? "upi_full" : "usdt_crypto");
    setProof("");
    setSubmitted(false);
    setCopied(null);
  }, [method]);

  const visiblePlans = useMemo<Plan[]>(
    () => (method ? plansForMethod(method) : []),
    [method],
  );
  const activePlan: Plan =
    method === "usdt" ? PLANS.usdt_crypto : PLANS[selectedPlan];

  const copy = async (text: string, kind: "addr" | "upi") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      toast.success(kind === "addr" ? "Wallet address copied" : "UPI ID copied");
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error("Copy failed — please copy manually");
    }
  };

  const submitProof = useCallback(async () => {
    if (!proof.trim()) return;
    setSubmitting(true);
    try {
      if (PAYMENT_VERIFY_URL) {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        await fetch(PAYMENT_VERIFY_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            planId: activePlan.id,
            method: activePlan.method,
            proof: proof.trim(),
          }),
        });
      }
      setSubmitted(true);
      toast.success("Payment proof received — your Pro pass will activate after verification.");
      onSuccess?.();
    } catch {
      toast.error("Could not submit proof. Please try again or contact support.");
    } finally {
      setSubmitting(false);
    }
  }, [activePlan, proof, onSuccess]);

  const usdtReady = method === "usdt" && Boolean(USDT_WALLET_ADDRESS) && isValidTxId(proof);
  const upiReady =
    method === "upi" && Boolean(UPI_ID) && proof.trim().length >= 6 && proof.trim().length <= 40;

  /* --------------------------------------------------------- method toggle */
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-lg font-bold text-foreground flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-primary" /> Upgrade to Pro
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Pick a payment method — your QR &amp; details appear below.
          </p>
        </div>
      </div>

      {/* Interactive method selector — nothing is revealed until chosen. */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setMethod("usdt")}
          className={`group relative flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-all ${
            method === "usdt"
              ? "border-primary bg-primary/10 ring-1 ring-primary/40 shadow-neon-glow"
              : "border-border/70 bg-secondary/30 hover:border-primary/40"
          }`}
        >
          <div className="flex items-center gap-2">
            <UsdtLogo size={26} className="drop-shadow-[0_0_10px_rgba(38,161,123,0.4)]" />
            <span className="font-display font-bold text-foreground">USDT (Crypto)</span>
          </div>
          <span className="text-[11px] text-muted-foreground">Pay with USDT on TRON · $9 · 30 days</span>
          {method === "usdt" && (
            <span className="absolute right-2 top-2 text-primary"><Check className="h-4 w-4" /></span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setMethod("upi")}
          className={`group relative flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-all ${
            method === "upi"
              ? "border-primary bg-primary/10 ring-1 ring-primary/40 shadow-neon-glow"
              : "border-border/70 bg-secondary/30 hover:border-primary/40"
          }`}
        >
          <div className="flex items-center gap-2">
            <IndianRupee className="h-6 w-6 text-primary" />
            <span className="font-display font-bold text-foreground">UPI (India)</span>
          </div>
          <span className="text-[11px] text-muted-foreground">Pay via UPI · ₹860 / ₹400 · 30 / 15 days</span>
          {method === "upi" && (
            <span className="absolute right-2 top-2 text-primary"><Check className="h-4 w-4" /></span>
          )}
        </button>
      </div>

      {!method && (
        <div className="rounded-xl border border-dashed border-border/70 bg-secondary/20 p-5 text-center text-sm text-muted-foreground">
          Select <span className="font-semibold text-foreground">USDT</span> or{" "}
          <span className="font-semibold text-foreground">UPI</span> above to reveal your payment QR and details.
        </div>
      )}

      {/* ----------------------------------------------------- USDT details */}
      {method === "usdt" && (
        <div className="space-y-4 rounded-2xl border border-primary/20 bg-card/40 p-4">
          {!IS_USDT_CONFIGURED && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
              <TriangleAlert className="h-3.5 w-3.5" /> USDT wallet address not configured — set VITE_USDT_WALLET_ADDRESS.
            </div>
          )}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UsdtLogo size={22} />
              <div>
                <p className="font-display font-bold text-foreground leading-tight">{PLANS.usdt_crypto.name}</p>
                <p className="text-[11px] text-muted-foreground">USDT · {USDT_DEPOSIT_NETWORK} · 30-day Pro</p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-display text-2xl font-black text-foreground">$9</p>
              <p className="text-[10px] text-muted-foreground">one-time</p>
            </div>
          </div>

          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
            <div className="flex flex-col items-center gap-2">
              <div className="rounded-xl border border-border/60 bg-white p-3">
                <QRCodeSVG value={USDT_WALLET_ADDRESS} size={156} level="H" bgColor="#ffffff" fgColor="#0a0a12" />
              </div>
              <p className="max-w-[180px] rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-center text-[10px] font-semibold leading-snug text-amber-200">
                {USDT_GASFREE_WARNING}
              </p>
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
                <Wallet className="h-3.5 w-3.5" /> Deposit address · {USDT_DEPOSIT_NETWORK}
              </p>
              <code className="block break-all rounded-lg border border-border/60 bg-secondary/40 px-3 py-2 text-xs text-foreground">
                {USDT_WALLET_ADDRESS}
              </code>
              <Button variant="outline" size="sm" onClick={() => void copy(USDT_WALLET_ADDRESS, "addr")} className="w-full">
                {copied === "addr" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied === "addr" ? "Copied" : "Copy address"}
              </Button>
            </div>
          </div>

          <ul className="space-y-1 text-[11px] text-muted-foreground">
            <li>• Send only <span className="font-semibold text-foreground">USDT on TRON (TRC-20)</span> to this address.</li>
            <li>• Other networks (ERC-20, BEP-20) may lose funds.</li>
            <li>• Keep some TRX for network fees.</li>
          </ul>

          <ProofField
            label="Transaction Hash (TXID)"
            placeholder="Paste your 64-character USDT TXID"
            value={proof}
            onChange={setProof}
            ready={usdtReady}
            submitting={submitting}
            submitted={submitted}
            onSubmit={submitProof}
          />
        </div>
      )}

      {/* ------------------------------------------------------- UPI details */}
      {method === "upi" && (
        <div className="space-y-4">
          {!IS_UPI_CONFIGURED && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
              <TriangleAlert className="h-3.5 w-3.5" /> UPI details not configured — set VITE_UPI_ID / VITE_UPI_PAYEE_NAME.
            </div>
          )}

          {/* Plan selection (two INR plans) */}
          <div className="grid gap-3 sm:grid-cols-2">
            {visiblePlans.map((plan) => {
              const selected = selectedPlan === plan.id;
              return (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => setSelectedPlan(plan.id)}
                  className={`rounded-xl border p-4 text-left transition-all ${
                    selected
                      ? "border-primary bg-primary/10 ring-1 ring-primary/40"
                      : "border-border/70 bg-secondary/30 hover:border-primary/40"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-display font-bold text-foreground">{plan.name}</span>
                    {selected && <Check className="h-4 w-4 text-primary" />}
                  </div>
                  <p className="mt-1 font-display text-xl font-black text-foreground">
                    ₹{plan.amount}
                    <span className="ml-1 text-[11px] font-normal text-muted-foreground">· {plan.durationDays} days</span>
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{plan.description}</p>
                </button>
              );
            })}
          </div>

          <div className="rounded-2xl border border-primary/20 bg-card/40 p-4">
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
              <div className="rounded-xl border border-border/60 bg-white p-3">
                <QRCodeSVG value={buildUpiIntent(activePlan.amount)} size={156} level="H" bgColor="#ffffff" fgColor="#0a0a12" />
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
                  <ScanLine className="h-3.5 w-3.5" /> Scan with any UPI app
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Payee: <span className="text-foreground">{UPI_PAYEE_NAME}</span>
                </p>
                <code className="block break-all rounded-lg border border-border/60 bg-secondary/40 px-3 py-2 text-xs text-foreground">
                  {UPI_ID}
                </code>
                <Button variant="outline" size="sm" onClick={() => void copy(UPI_ID, "upi")} className="w-full">
                  {copied === "upi" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied === "upi" ? "Copied" : "Copy UPI ID"}
                </Button>
                <a
                  href={buildUpiIntent(activePlan.amount)}
                  className="block rounded-lg bg-primary/15 px-3 py-2 text-center text-xs font-semibold text-primary hover:bg-primary/25"
                >
                  Open UPI app · pay ₹{activePlan.amount}
                </a>
              </div>
            </div>

            <ProofField
              label="UTR / Reference Number"
              placeholder="Paste the UTR from your UPI app"
              value={proof}
              onChange={setProof}
              ready={upiReady}
              submitting={submitting}
              submitted={submitted}
              onSubmit={submitProof}
            />
          </div>
        </div>
      )}

      {!isAuthenticated && (
        <p className="text-center text-[11px] text-muted-foreground">
          Sign in to track your Pro activation after payment.
        </p>
      )}
    </div>
  );
}

/* ----------------------------------------------------- shared proof field */

function ProofField({
  label,
  placeholder,
  value,
  onChange,
  ready,
  submitting,
  submitted,
  onSubmit,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  ready: boolean;
  submitting: boolean;
  submitted: boolean;
  onSubmit: () => void;
}) {
  if (submitted) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-300">
        <ShieldCheck className="h-4 w-4" /> Proof submitted — verification in progress.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <label className="text-[11px] font-semibold text-muted-foreground">{label}</label>
      <input
        className="h-11 w-full rounded-lg border border-border/70 bg-secondary/40 px-3 text-sm text-foreground outline-none focus:border-primary/50"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
      />
      <Button
        onClick={onSubmit}
        disabled={!ready || submitting}
        className="cyber-button h-11 w-full gap-2"
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
        {submitting ? "Submitting…" : "Submit Payment Proof"}
      </Button>
    </div>
  );
}
