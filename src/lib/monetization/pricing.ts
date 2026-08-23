/**
 * Centralized pricing + payment configuration for TubeClick Pro.
 *
 * New structure (per product decision):
 *   - USDT Crypto Plan ........ $9 USD .... paid via USDT (TRC-20) only ... 30 days
 *   - UPI Full Plan ........... ₹860 INR .. paid via UPI only ............ 30 days
 *   - 15-Days Mini Plan ....... ₹400 INR .. paid via UPI only ............ 15 days
 *
 * Payment verification is client-side / manual: the user pays, then pastes a
 * TxID (USDT) or UTR / reference number (UPI). No live backend invoice pricing
 * is required.
 *
 * ── ASSETS (configured) ────────────────────────────────────────────────────
 *   USDT (TRC-20) deposit : TPoQWN8Ur1Pfi3vAJT4QjSWoBK7Wabubth
 *   UPI ID                : rjrazzrazz-1@okicici  (Rj Razz)
 * Override any of these with the matching VITE_* environment variable.
 */

export type PaymentMethod = "usdt" | "upi";
export type PlanId = "usdt_crypto" | "upi_full" | "mini_15";

export interface Plan {
  id: PlanId;
  name: string;
  /** Short price label for cards, e.g. "$9" or "₹860". */
  priceLabel: string;
  amount: number;
  currency: "USD" | "INR";
  durationDays: number;
  /** The only payment method accepted for this plan. */
  method: PaymentMethod;
  description: string;
  highlight?: boolean;
}

/* ----------------------------------------------------------------- environment */

/**
 * Live payment assets (provided by admin). Override via env if needed; the
 * production values are shipped as the defaults so the app works out of the
 * box.
 */
export const USDT_WALLET_ADDRESS =
  import.meta.env.VITE_USDT_WALLET_ADDRESS || "TPoQWN8Ur1Pfi3vAJT4QjSWoBK7Wabubth"; // USDT (TRC-20)
export const UPI_ID = import.meta.env.VITE_UPI_ID || "rjrazzrazz-1@okicici";
export const UPI_PAYEE_NAME = import.meta.env.VITE_UPI_PAYEE_NAME || "Rj Razz";
/** Optional. When set, proof submissions are POSTed here; otherwise they are
 *  stored locally and surfaced as "awaiting verification". */
export const PAYMENT_VERIFY_URL = import.meta.env.VITE_PAYMENT_VERIFY_URL || "";

/**
 * CRITICAL safety warning shown directly under the USDT QR code. Users must
 * only send TRON-based (GasFree) USDT to this address.
 */
export const USDT_GASFREE_WARNING =
  "⚠️ You can transfer only TRON-based GasFree tokens (e.g. USDT) to this address. Other tokens may get lost during transfer.";

/* Sanity flags so the UI can warn if an asset is missing entirely. */
export const IS_USDT_CONFIGURED = Boolean(USDT_WALLET_ADDRESS);
export const IS_UPI_CONFIGURED = Boolean(UPI_ID);

/* ---------------------------------------------------------------------- plans */

export const PLANS: Record<PlanId, Plan> = {
  usdt_crypto: {
    id: "usdt_crypto",
    name: "USDT Crypto Plan",
    priceLabel: "$9",
    amount: 9,
    currency: "USD",
    durationDays: 30,
    method: "usdt",
    description: "Pay once with USDT on TRON (TRC-20). 30-day Pro pass.",
    highlight: true,
  },
  upi_full: {
    id: "upi_full",
    name: "UPI Full Plan",
    priceLabel: "₹860",
    amount: 860,
    currency: "INR",
    durationDays: 30,
    method: "upi",
    description: "Full 30-day Pro pass via UPI (India). Instant activation.",
  },
  mini_15: {
    id: "mini_15",
    name: "15-Days Mini Plan",
    priceLabel: "₹400",
    amount: 400,
    currency: "INR",
    durationDays: 15,
    method: "upi",
    description: "Short 15-day Pro trial via UPI (India). Low-commitment entry.",
  },
};

export const PLAN_LIST: Plan[] = [PLANS.usdt_crypto, PLANS.upi_full, PLANS.mini_15];

/** Plans available under a given payment method. */
export function plansForMethod(method: PaymentMethod): Plan[] {
  return PLAN_LIST.filter((plan) => plan.method === method);
}

/** Build a UPI deep-link / intent URL for a given amount. */
export function buildUpiIntent(amount: number, note = "TubeClick Pro"): string {
  const params = new URLSearchParams({
    pa: UPI_ID,
    pn: UPI_PAYEE_NAME,
    am: String(amount),
    cu: "INR",
    tn: note,
  });
  return `upi://pay?${params.toString()}`;
}

/** Display currency symbol for a plan. */
export function currencySymbol(currency: Plan["currency"]): string {
  return currency === "USD" ? "$" : "₹";
}
