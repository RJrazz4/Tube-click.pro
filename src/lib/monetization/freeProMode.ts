/**
 * FREE PRO MODE — single switch for the growth/marketing pivot (2026-10-20,
 * Round 4, amended by the owner the same day).
 *
 * When true:
 *   • Every SIGNED-IN user who has submitted the Professional Details lead
 *     form resolves as Pro everywhere the app checks entitlement
 *     (isProTier / useIsPro / feature maps in useAuthStore). The form IS the
 *     activation step — Pro is NOT instant-on-login.
 *   • All purchase surfaces (ProUpgradeModal checkout tabs, Settings →
 *     Subscription purchase area) are replaced with the free-offer state.
 *     The payment code (PaymentCheckout, pricing, verifier) is PARKED, not
 *     deleted — it is simply unrouted while this flag is on.
 *   • Guests stay guests: generation still requires sign-in (SoftGate).
 *
 * To restore paid monetization later: flip this to false and redeploy.
 * One line. (Server-side api/ routes have their own entitlement checks —
 * see the Round 4 audit notes; those need the matching server decision.)
 */
export const FREE_PRO_MODE = true;

/** Shared marketing copy for the free-Pro state (one source, reused). */
export const FREE_PRO_HEADLINE = "Pro is FREE for everyone right now";
export const FREE_PRO_SUBLINE =
  "Every tool unlocked — no payment, no plans. Just complete your professional details once to activate.";
export const FREE_PRO_FEATURES = [
  "Script & title engine (Clone & Crush)",
  "SEO tags & competitor analysis",
  "Neural voice studio",
  "Repurposer & Clipper",
  "Trend radar & Daily brief",
];
