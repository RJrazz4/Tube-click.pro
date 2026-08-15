/**
 * Crypto payment checkout for the Subscription tab.
 *
 * USDT TRC-20 deposit + manual TxID verification against the
 * TubeClick Pro payment verifier service (Render).
 *
 * Flow:
 *   1. POST /api/payments/invoices        -> server-priced invoice
 *   2. user sends USDT, pastes TxID
 *   3. POST /api/payments/invoices/:id/submit -> enqueue verification
 *   4. poll  GET  /api/payments/invoices/:id   -> status until terminal
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Loader2, ShieldCheck, TriangleAlert, Wallet } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ config */

const API_BASE_URL = import.meta.env.VITE_PAYMENT_API_URL || "";
const PLAN_CODE = "premium_monthly";
const TOKEN_SYMBOL = "USDT";
const NETWORK_LABEL = "TRON (TRC-20)";
const TOKEN_DECIMALS = 6;
/** Canonical merchant deposit address (base58). */
const DEPOSIT_ADDRESS = "TGCVQMg4WrE4N4KaquY8SFS4Ftq5711WNM";
const QR_ASSET = "/usdt-trc20-qr.jpg";

/* ------------------------------------------------------------------- types */

type InvoiceStatus =
  | "pending"
  | "detected"
  | "confirming"
  | "paid"
  | "expired"
  | "rejected";

interface Invoice {
  invoiceId: string;
  tokenSymbol: string;
  network: string;
  amountAtomic: string;
  attributionMode: string;
  expiresAt: string;
}

/* ----------------------------------------------------------------- helpers */

const STATUS_META: Record<InvoiceStatus, { label: string; tone: string }> = {
  pending: { label: "Awaiting payment", tone: "text-cyan-300 border-cyan-400/25 bg-cyan-400/10" },
  detected: { label: "Payment detected — confirming…", tone: "text-cyan-300 border-cyan-400/25 bg-cyan-400/10" },
  confirming: { label: "Confirming on-chain…", tone: "text-amber-300 border-amber-400/25 bg-amber-400/10" },
  paid: { label: "Premium activated", tone: "text-green-400 border-green-400/25 bg-green-400/10" },
  expired: { label: "Invoice expired", tone: "text-destructive border-destructive/25 bg-destructive/10" },
  rejected: { label: "Payment rejected", tone: "text-destructive border-destructive/25 bg-destructive/10" },
};

const TERMINAL: InvoiceStatus[] = ["paid", "expired", "rejected"];

function isValidTxId(tx: string): boolean {
  return /^(0x)?[0-9a-fA-F]{64}$/.test(tx.trim());
}

function formatAtomic(atomic: string, decimals: number): string {
  const n = BigInt(atomic || "0");
  const s = n.toString().padStart(decimals + 1, "0");
  const whole = s.slice(0, s.length - decimals) || "0";
  const frac = s.slice(s.length - decimals).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

/** Authenticated fetch helper — attaches the Supabase access token. */
async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!API_BASE_URL) {
    throw new Error("VITE_PAYMENT_API_URL is not configured.");
  }
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not signed in.");

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* no body */
  }

  if (!res.ok) {
    const code = (body as { error?: string } | null)?.error ?? `HTTP ${res.status}`;
    throw new Error(code);
  }
  return body as T;
}

/* -------------------------------------------------------------- component */

export function CryptoCheckout() {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [status, setStatus] = useState<InvoiceStatus>("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [txId, setTxId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  const pollRef = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // 1. Create the invoice on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const inv = await apiFetch<Invoice>("/api/payments/invoices", {
          method: "POST",
          body: JSON.stringify({ planCode: PLAN_CODE }),
        });
        if (!cancelled) {
          setInvoice(inv);
          setStatus("pending");
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not create invoice.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [stopPolling]);

  // 2. Poll invoice status until terminal.
  const refresh = useCallback(async () => {
    if (!invoice) return;
    try {
      const s = await apiFetch<{ status: InvoiceStatus }>(
        `/api/payments/invoices/${invoice.invoiceId}`,
      );
      setStatus(s.status);
      if (TERMINAL.includes(s.status)) stopPolling();
    } catch {
      /* transient — keep polling */
    }
  }, [invoice, stopPolling]);

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(DEPOSIT_ADDRESS);
      setCopied(true);
      toast.success("Address copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copy failed — please copy manually");
    }
  };

  // 3. Verify Payment → submit TxID → begin polling.
  const verify = async () => {
    if (!invoice) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/api/payments/invoices/${invoice.invoiceId}/submit`, {
        method: "POST",
        body: JSON.stringify({ txId: txId.trim() }),
      });
      toast.success("Payment submitted — verifying on-chain");
      await refresh();
      stopPolling();
      pollRef.current = window.setInterval(refresh, 5000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const amount = useMemo(
    () => (invoice ? formatAtomic(invoice.amountAtomic, TOKEN_DECIMALS) : "20"),
    [invoice],
  );
  const txValid = isValidTxId(txId);
  const meta = STATUS_META[status];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-display font-semibold text-foreground mb-2">
          Subscription
        </h2>
        <p className="text-sm text-muted-foreground">
          Pay once with USDT to activate your Premium subscription instantly.
        </p>
      </div>

      {/* ---- Asset selection ---- */}
      <Card className="cyber-card border-border">
        <CardContent className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-300 text-lg font-bold text-emerald-950">
              ₮
            </div>
            <div>
              <p className="font-display text-base font-semibold text-foreground">
                {TOKEN_SYMBOL}
              </p>
              <p className="text-xs text-muted-foreground">{NETWORK_LABEL}</p>
            </div>
          </div>
          <Badge className="border-green-400/30 bg-green-400/10 text-green-400">
            <Check className="mr-1 h-3 w-3" /> Recommended
          </Badge>
        </CardContent>
      </Card>

      {/* ---- Amount ---- */}
      <Card className="cyber-card border-primary/20 neon-glow-purple">
        <CardContent className="flex items-center justify-between p-4">
          <div>
            <p className="text-xs text-muted-foreground">Amount due</p>
            <p className="font-display text-3xl font-bold text-foreground">
              {amount} <span className="text-primary">{TOKEN_SYMBOL}</span>
            </p>
          </div>
          <p className="text-xs text-muted-foreground text-right">
            Fixed price
            <br />no market fluctuation
          </p>
        </CardContent>
      </Card>

      {/* ---- Warnings ---- */}
      <div className="space-y-2">
        {[
          <>
            Send only <strong className="text-foreground">USDT on TRON (TRC-20)</strong> to this address.
          </>,
          <>
            Do <strong className="text-foreground">not</strong> send via ERC-20, BEP-20 or another network — funds may be lost.
          </>,
          <>
            Send the <strong className="text-foreground">exact amount</strong>. Under/overpayments require manual review.
          </>,
          <>
            Keep <strong className="text-foreground">TRX or bandwidth/energy</strong> — the sender pays network fees.
          </>,
        ].map((line, i) => (
          <div
            key={i}
            className="flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-400/[0.07] px-3 py-2 text-xs leading-relaxed text-amber-200"
          >
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
            <span>{line}</span>
          </div>
        ))}
      </div>

      {/* ---- QR + address ---- */}
      <Card className="cyber-card border-border">
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
          <div className="mx-auto h-40 w-40 shrink-0 overflow-hidden rounded-xl border border-border bg-black p-2 sm:mx-0">
            <img
              src={QR_ASSET}
              alt="USDT TRC-20 deposit QR code"
              className="h-full w-full object-contain"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <Wallet className="h-3.5 w-3.5" /> Deposit address · {TOKEN_SYMBOL} {NETWORK_LABEL}
            </p>
            <code className="mb-3 block break-all rounded-lg border border-border bg-secondary/50 p-3 font-mono text-xs text-cyan-300">
              {DEPOSIT_ADDRESS}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={copyAddress}
              className="border-cyan-400/30 bg-cyan-400/10 text-cyan-300 hover:bg-cyan-400/20"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy address"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ---- Steps ---- */}
      <Card className="cyber-card border-border">
        <CardHeader>
          <CardTitle className="text-base font-display">How to pay</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3">
            {[
              <>Copy the address or scan the <strong className="text-foreground">QR code</strong> with your wallet.</>,
              <>Send <strong className="text-foreground">exactly {amount} USDT</strong> on {NETWORK_LABEL}.</>,
              <>Copy the <strong className="text-foreground">Transaction Hash (TXID)</strong> from your wallet.</>,
              <>Paste it below and press <strong className="text-foreground">Verify Payment</strong>.</>,
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-xs font-bold text-primary">
                  {i + 1}
                </span>
                <span className="text-sm leading-relaxed text-muted-foreground">{step}</span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {/* ---- TxID verification ---- */}
      <Card className="cyber-card border-border">
        <CardHeader>
          <CardTitle className="text-base font-display">Verify your payment</CardTitle>
          <CardDescription className="text-xs">
            Paste your transaction hash to confirm payment and activate Premium.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            value={txId}
            onChange={(e) => setTxId(e.target.value)}
            placeholder="Transaction Hash (TXID)"
            spellCheck={false}
            autoComplete="off"
            className="bg-secondary/50 font-mono text-xs"
          />
          {txId.length > 0 && !txValid && (
            <p className="text-xs text-destructive">TXID must be 64 hex characters.</p>
          )}

          <Button
            onClick={verify}
            disabled={!txValid || submitting || status === "paid" || loading}
            className="cyber-button w-full"
            size="lg"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Verifying…
              </>
            ) : status === "paid" ? (
              <>
                <Check className="h-4 w-4" /> Payment verified
              </>
            ) : (
              "Verify Payment"
            )}
          </Button>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {(status === "pending" || status === "detected" || status === "confirming") && (
            <div className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium", meta.tone)}>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {meta.label}
            </div>
          )}
          {status === "paid" && (
            <div className="flex items-center gap-2 rounded-lg border border-green-400/25 bg-green-400/10 px-3 py-2 text-xs font-medium text-green-400">
              <ShieldCheck className="h-4 w-4" /> Premium activated — welcome aboard!
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
