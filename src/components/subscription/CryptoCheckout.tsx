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
 *
 * Styling: premium glassmorphism (see checkout.css).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Check, ChevronDown, Copy, Loader2, ShieldCheck, TriangleAlert, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { UsdtLogo, USDT_LOGO_DATA_URI } from "./UsdtLogo";
import "./checkout.css";

/* ------------------------------------------------------------------ config */

const API_BASE_URL = import.meta.env.VITE_PAYMENT_API_URL || "";
const PLAN_CODE = "premium_monthly";
const TOKEN_SYMBOL = "USDT";
const NETWORK_LABEL = "TRON (TRC-20)";
const TOKEN_DECIMALS = 6;
/** Canonical merchant deposit address (base58). */
const DEPOSIT_ADDRESS = "TGCVQMg4WrE4N4KaquY8SFS4Ftq5711WNM";

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

const TERMINAL: InvoiceStatus[] = ["paid", "expired", "rejected"];

const STATUS_META: Record<InvoiceStatus, { label: string; tone: "info" | "warn" | "success" | "error" }> = {
  pending: { label: "Awaiting payment", tone: "info" },
  detected: { label: "Payment detected — confirming…", tone: "info" },
  confirming: { label: "Confirming on-chain…", tone: "warn" },
  paid: { label: "Premium activated", tone: "success" },
  expired: { label: "Invoice expired", tone: "error" },
  rejected: { label: "Payment rejected", tone: "error" },
};

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
  const [warnOpen, setWarnOpen] = useState(false);

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

  const warnings = [
    <>Send only <strong>USDT on TRON (TRC-20)</strong> to this address.</>,
    <>Do <strong>not</strong> send via ERC-20, BEP-20 or another network — funds may be lost.</>,
    <>Send the <strong>exact amount</strong>. Under/overpayments require manual review.</>,
    <>Keep <strong>TRX or bandwidth/energy</strong> — the sender pays network fees.</>,
  ];

  return (
    <div className="tcp-root">
      {/* ---- Header ---- */}
      <header className="tcp-header">
        <h2 className="tcp-title">Premium Subscription</h2>
        <p className="tcp-subtitle">
          Unlock unlimited generation with a single USDT payment.
        </p>
      </header>

      {/* ---- Hero price (featured) ---- */}
      <div className="tcp-card tcp-card--featured">
        <span className="tcp-plan-label">
          <ShieldCheck className="h-3.5 w-3.5" /> Premium Monthly
        </span>
        <div className="tcp-price-row">
          <span className="tcp-price">{loading ? "—" : amount}</span>
          <span className="tcp-price-sym">{TOKEN_SYMBOL}</span>
        </div>
        <p className="tcp-price-note">
          One-time payment · activation after payment review
        </p>
      </div>

      {/* ---- Asset selection ---- */}
      <div className="tcp-card">
        <div className="tcp-asset">
          <div className="tcp-asset-left">
            <UsdtLogo size={44} className="drop-shadow-[0_0_14px_rgba(38,161,123,0.5)]" />
            <div>
              <p className="tcp-asset-name">{TOKEN_SYMBOL}</p>
              <p className="tcp-asset-net">
                <UsdtLogo size={13} /> {NETWORK_LABEL}
              </p>
            </div>
          </div>
          <span className="tcp-badge">
            <Check className="h-3.5 w-3.5" /> Recommended
          </span>
        </div>
      </div>

      {/* ---- Elegant collapsible warnings ---- */}
      <div className="tcp-warning" data-open={warnOpen}>
        <button
          type="button"
          className="tcp-warning-head"
          onClick={() => setWarnOpen((v) => !v)}
          aria-expanded={warnOpen}
        >
          <TriangleAlert className="tcp-warning-icon h-4 w-4" />
          <span>Send only USDT on TRON (TRC-20) — funds on other networks are lost</span>
          <ChevronDown className="tcp-warning-chevron h-4 w-4" />
        </button>
        {warnOpen && (
          <div className="tcp-warning-body">
            {warnings.map((w, i) => (
              <div key={i} className="tcp-warning-item">
                <span className="tcp-warning-dot" />
                <span>{w}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---- QR + address ---- */}
      <div className="tcp-card" style={{ marginTop: 16 }}>
        <div className="tcp-deposit">
          <div className="tcp-qr-panel">
            <QRCodeSVG
              value={DEPOSIT_ADDRESS}
              size={176}
              level="H"
              bgColor="#ffffff"
              fgColor="#0a0a12"
              imageSettings={{
                src: USDT_LOGO_DATA_URI,
                width: 42,
                height: 42,
                excavate: true,
              }}
            />
            <span className="tcp-qr-caption">
              <UsdtLogo size={14} /> Scan with your TRON wallet
            </span>
          </div>

          <div style={{ minWidth: 0, flex: 1 }}>
            <span className="tcp-address-label">
              <Wallet className="h-3.5 w-3.5" /> Deposit address · {TOKEN_SYMBOL} {NETWORK_LABEL}
            </span>
            <code className="tcp-address">{DEPOSIT_ADDRESS}</code>
            <button type="button" className="tcp-btn-copy" onClick={copyAddress}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy address"}
            </button>
          </div>
        </div>
      </div>

      {/* ---- Steps ---- */}
      <div className="tcp-card">
        <span className="tcp-label">How to pay</span>
        <ol className="tcp-steps" style={{ marginTop: 14 }}>
          {[
            <>Copy the address or scan the <strong>QR code</strong> with your wallet.</>,
            <>Send <strong>exactly {amount} USDT</strong> on {NETWORK_LABEL}.</>,
            <>Copy the <strong>Transaction Hash (TXID)</strong> from your wallet.</>,
            <>Paste it below and press <strong>Verify Payment</strong>.</>,
          ].map((step, i) => (
            <li key={i} className="tcp-step">
              <span className="tcp-step-num">{i + 1}</span>
              <span className="tcp-step-text">{step}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* ---- TxID verification ---- */}
      <div className="tcp-card">
        <span className="tcp-label">Verify your payment</span>
        <p className="tcp-subtitle" style={{ marginTop: 6, marginBottom: 16 }}>
          Paste your transaction hash to confirm payment and activate Premium.
        </p>

        <input
          className="tcp-input"
          value={txId}
          onChange={(e) => setTxId(e.target.value)}
          placeholder="Transaction Hash (TXID)"
          spellCheck={false}
          autoComplete="off"
        />
        {txId.length > 0 && !txValid && (
          <p className="tcp-input-error">TXID must be 64 hex characters.</p>
        )}

        <button
          type="button"
          className="tcp-btn-primary tcp-btn-primary--pulse"
          onClick={verify}
          disabled={!txValid || submitting || status === "paid" || loading}
          style={{ marginTop: 16 }}
        >
          {submitting ? (
            <>
              <Loader2 className="tcp-spin h-4 w-4" /> Verifying…
            </>
          ) : status === "paid" ? (
            <>
              <Check className="h-4 w-4" /> Payment verified
            </>
          ) : (
            "Verify Payment"
          )}
        </button>

        {error && (
          <div className="tcp-status tcp-status--error">
            <TriangleAlert className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {(status === "pending" || status === "detected" || status === "confirming") && (
          <div className={`tcp-status tcp-status--${meta.tone}`}>
            <Loader2 className="tcp-spin h-4 w-4" />
            <span>{meta.label}</span>
          </div>
        )}
        {status === "paid" && (
          <div className="tcp-status tcp-status--success">
            <ShieldCheck className="h-4 w-4" /> Premium activated — welcome aboard!
          </div>
        )}
      </div>
    </div>
  );
}
