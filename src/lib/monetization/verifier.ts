/**
 * Client for the TubeClick Pro payment verifier service (Render).
 *
 * Contract (per the in-repo documented invoice flow — CryptoCheckout
 * docstring, which is the only written spec of the verifier's API):
 *   POST /api/payments/invoices            { planCode }            -> invoice
 *   POST /api/payments/invoices/:id/submit { txId } | { utr }      -> enqueue
 *   GET  /api/payments/invoices/:id                               -> { status }
 * Invoice statuses: pending | detected | confirming | paid | expired | rejected
 *
 * STOP FLAGS (need backend confirmation — the verifier repo is private and
 * its deployed service exposes no docs endpoint):
 *   1. The exact submit payload for UPI is UNCONFIRMED. We send { utr }.
 *      If the verifier expects a different field, it will reject/ignore it.
 *   2. Plan codes sent are the frontend PlanIds (usdt_trial_3, usdt_crypto,
 *      upi_trial_3, upi_full, mini_15). The verifier's deploy notes seed
 *      usdt_trial_3 / upi_trial_3; the rest follow the same convention but
 *      were not confirmed server-side.
 *   3. Invoice expiry window is server-defined (unknown here).
 *
 * Base URL: VITE_PAYMENT_VERIFY_URL (explicit proof-submit endpoint, legacy
 * seam) or VITE_PAYMENT_API_URL (the verifier service root — configured in
 * Vercel Production+Preview). When neither is set the verifier is
 * "not connected" and the UI must stay honest about it.
 */
import { getValidAccessToken } from "@/lib/auth/accessToken";
import type { PaymentMethod } from "./pricing";

const VERIFIER_BASE = (
  import.meta.env.VITE_PAYMENT_VERIFY_URL ||
  import.meta.env.VITE_PAYMENT_API_URL ||
  ""
).replace(/\/+$/, "");

/** True when a verifier endpoint is configured — the only honest gate. */
export const isVerifierConfigured = () => Boolean(VERIFIER_BASE);

export type InvoiceStatus =
  | "pending"
  | "detected"
  | "confirming"
  | "paid"
  | "expired"
  | "rejected";

export interface VerifierInvoice {
  invoiceId: string;
  status?: InvoiceStatus;
  amountAtomic?: string;
  expiresAt?: string;
  /** Passthrough of any other fields the verifier returns. */
  [key: string]: unknown;
}

const TERMINAL: InvoiceStatus[] = ["paid", "expired", "rejected"];
export const isTerminalInvoiceStatus = (s: string | undefined) =>
  !!s && (TERMINAL as string[]).includes(s);

async function authedFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!VERIFIER_BASE) throw new Error("Payment verifier is not connected in this deployment.");
  const token = await getValidAccessToken();
  const res = await fetch(`${VERIFIER_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) {
    const msg =
      (body as { error?: string; message?: string } | null)?.error ||
      (body as { error?: string; message?: string } | null)?.message ||
      `Verifier request failed (HTTP ${res.status})`;
    throw new Error(msg);
  }
  return body as T;
}

/** Create a server-priced invoice for a plan. */
export function createInvoice(planCode: string): Promise<VerifierInvoice> {
  return authedFetch<VerifierInvoice>("/api/payments/invoices", {
    method: "POST",
    body: JSON.stringify({ planCode }),
  });
}

/** Submit payment proof against an invoice. */
export function submitInvoiceProof(
  invoiceId: string,
  method: PaymentMethod,
  proof: string,
): Promise<VerifierInvoice> {
  const payload =
    method === "usdt"
      ? { txId: proof.trim() }
      : { utr: proof.trim() }; // STOP FLAG: UPI payload field unconfirmed
  return authedFetch<VerifierInvoice>(
    `/api/payments/invoices/${encodeURIComponent(invoiceId)}/submit`,
    { method: "POST", body: JSON.stringify(payload) },
  );
}

/** Poll an invoice until it reaches a terminal state. */
export function getInvoice(invoiceId: string): Promise<VerifierInvoice> {
  return authedFetch<VerifierInvoice>(
    `/api/payments/invoices/${encodeURIComponent(invoiceId)}`,
  );
}
