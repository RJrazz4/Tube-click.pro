/**
 * Centralized pricing + payment configuration for TubeClick Pro.
 *
 * Current structure (per product decision):
 *   - USDT Trial .............. $1 USD .... paid via USDT (TRC-20) only ... 3 days
 *   - USDT Crypto Plan ........ $9 USD .... paid via USDT (TRC-20) only ... 30 days
 *   - UPI Trial ............... ₹99 INR ... paid via UPI only ............ 3 days
 *   - UPI Full Plan ........... ₹860 INR .. paid via UPI only ............ 30 days
 *   - 15-Days Mini Plan ....... ₹400 INR .. paid via UPI only ............ 15 days
 *   - Founder Plan ............ ₹99 INR ... paid via UPI only ............ 30 days
 *     (Round 4: the ONLY plan purchasable while FREE_PRO_MODE is on —
 *      ₹999 list, 90% OFF launch hook, 2-month launch window.)
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

import { FREE_PRO_MODE } from "./freeProMode";

export type PaymentMethod = "usdt" | "upi";
export type PlanId = "usdt_trial_3" | "usdt_crypto" | "upi_trial_3" | "upi_full" | "mini_15" | "founder_monthly_99";

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
  /** Per-plan discount percent shown in the badge (30 classic, 90 founder). */
  discountPct: number;
  /**
   * Explicit struck-through list price when it must be an exact figure
   * (founder: ₹999). When absent, original is derived from amount + pct.
   */
  listPrice?: number;
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
  usdt_trial_3: {
    id: "usdt_trial_3",
    name: "3-Days Trial Plan",
    priceLabel: "$1",
    amount: 1,
    currency: "USD",
    durationDays: 3,
    method: "usdt",
    description: "3 days of Pro access after USDT (TRC-20) payment review.",
    discountPct: 30,
  },
  usdt_crypto: {
    id: "usdt_crypto",
    name: "USDT Crypto Plan",
    priceLabel: "$9",
    amount: 9,
    currency: "USD",
    durationDays: 30,
    method: "usdt",
    description: "30 days of Pro access after USDT (TRC-20) payment review.",
    highlight: true,
    discountPct: 30,
  },
  upi_trial_3: {
    id: "upi_trial_3",
    name: "3-Days Trial Plan",
    priceLabel: "₹99",
    amount: 99,
    currency: "INR",
    durationDays: 3,
    method: "upi",
    description: "3 days of Pro access after UPI (India) payment review.",
    discountPct: 30,
  },
  upi_full: {
    id: "upi_full",
    name: "UPI Full Plan",
    priceLabel: "₹860",
    amount: 860,
    currency: "INR",
    durationDays: 30,
    method: "upi",
    description: "30 days of Pro access after UPI (India) payment review.",
    discountPct: 30,
  },
  mini_15: {
    id: "mini_15",
    name: "15-Days Mini Plan",
    priceLabel: "₹400",
    amount: 400,
    currency: "INR",
    durationDays: 15,
    method: "upi",
    description: "15 days of Pro access after UPI (India) payment review.",
    discountPct: 30,
  },
  founder_monthly_99: {
    id: "founder_monthly_99",
    name: "Founder Plan",
    priceLabel: "₹99",
    amount: 99,
    currency: "INR",
    durationDays: 30,
    method: "upi",
    description: "Founder Plan — monthly supporter access. 30 days of Pro after UPI (India) payment review. Ye offer sirf 2 mahine ke liye hai.",
    highlight: true,
    discountPct: 90,
    listPrice: 999,
  },
};

export const PLAN_LIST: Plan[] = [PLANS.usdt_trial_3, PLANS.usdt_crypto, PLANS.upi_trial_3, PLANS.upi_full, PLANS.mini_15, PLANS.founder_monthly_99];

/**
 * Which plans may be sold right now. In FREE_PRO_MODE only the Founder Plan
 * stays purchasable; every other plan's purchase surface is parked (the plan
 * definitions and checkout code are untouched, so they come back with the
 * switch). NOTE: founder_monthly_99 must ALSO be seeded/accepted on the
 * payment-verifier side — otherwise invoice creation fails honestly.
 */
export function isPlanPurchasable(plan: Plan): boolean {
  return !FREE_PRO_MODE || plan.id === "founder_monthly_99";
}

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

/* ------------------------------------------------------------------ pricing */

/**
 * Discount pricing (owner directives, 2026-10-20):
 *   - Classic plans: EVERGREEN_DISCOUNT_PCT = 30% OFF, always on.
 *   - Founder Plan: 90% OFF launch hook (2-month window), ₹999 list.
 * The discount percent is PARAMETERIZED per plan (plan.discountPct), not
 * hardcoded — never duplicate this math in JSX.
 *
 * The code's `amount` is the CHARGED price (what the user actually pays);
 * the struck-through "original" is either the plan's explicit listPrice
 * (founder) or derived: round(charged / (1 - pct/100)).
 */
export const EVERGREEN_DISCOUNT_PCT = 30;

export interface PlanPrices {
  /** What the user actually pays (the code's canonical amount). */
  charged: number;
  /** Struck-through original price (explicit listPrice, else derived). */
  original: number;
  currency: Plan["currency"];
  /** Discount percent shown in the badge (per plan: 30 classic, 90 founder). */
  offPct: number;
  chargedLabel: string;
  originalLabel: string;
}

/** ONE source of truth for all price math — never hardcode prices in JSX. */
export function planPrices(plan: Plan): PlanPrices {
  const pct = plan.discountPct ?? EVERGREEN_DISCOUNT_PCT;
  const original = plan.listPrice ?? Math.round(plan.amount / (1 - pct / 100));
  const sym = currencySymbol(plan.currency);
  return {
    charged: plan.amount,
    original,
    currency: plan.currency,
    offPct: pct,
    chargedLabel: `${sym}${plan.amount}`,
    originalLabel: `${sym}${original}`,
  };
}
