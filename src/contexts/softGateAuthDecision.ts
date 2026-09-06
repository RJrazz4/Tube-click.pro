/**
 * Decision logic for the SoftGate auth-overlay safety net.
 *
 * The sign-in dialog (SoftGate) is shown when a `pending` auth request exists
 * and is only cleared by `finishPending(true)`, which fires inside
 * `syncSession()`'s `finally` — but only when that sync is still the latest
 * generation. If a later or interrupted session sync superseded it,
 * `finishPending(true)` was skipped and the dialog could stay open even though
 * the user has a valid session and requests return 200 (the UI "lockup" bug).
 *
 * This helper isolates the exact predicate fixed for that bug so it can be
 * regression-tested in isolation (the effect is a one-line consumer):
 * once the app has confirmed the user is authenticated AND entitlement has been
 * reconciled, any still-open pending auth request must be force-resolved.
 *
 * It is intentionally pure and dependency-free, so a regression test can clamp
 * the contract without rendering the whole provider.
 */
export interface ForceResolveAuthStatus {
  /** The session has been confirmed authenticated. */
  isAuthenticated: boolean;
  /** Entitlement reconciliation has finished (Free or Pro resolved). */
  isEntitlementVerified: boolean;
  /** True while entitlement reconciliation is still in progress. */
  isEntitlementLoading: boolean;
  /** There is still a pending auth request awaiting resolution. */
  hasPendingAuthRequest: boolean;
}

export function shouldForceResolvePendingAuth(status: ForceResolveAuthStatus): boolean {
  // Resolve only when the user is authenticated AND entitlement has fully
  // settled. Requiring !isEntitlementLoading is critical: the gated action that
  // resumes after sign-in needs isTierReady (== !isAuthLoading &&
  // !isEntitlementLoading), so resolving in the window between
  // isEntitlementVerified=true and isEntitlementLoading=false would let the
  // action run before its session is ready and silently bail.
  return (
    status.isAuthenticated &&
    status.isEntitlementVerified &&
    !status.isEntitlementLoading &&
    status.hasPendingAuthRequest
  );
}
