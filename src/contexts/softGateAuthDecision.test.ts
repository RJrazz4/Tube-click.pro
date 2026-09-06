import { describe, expect, it } from "vitest";
import { shouldForceResolvePendingAuth } from "./softGateAuthDecision";

describe("shouldForceResolvePendingAuth (SoftGate overlay safety net)", () => {
  it("force-resolves when auth AND entitlement are confirmed with a pending request", () => {
    expect(
      shouldForceResolvePendingAuth({
        isAuthenticated: true,
        isEntitlementVerified: true,
        hasPendingAuthRequest: true,
      }),
    ).toBe(true);
  });

  it("does NOT resolve when the user is not authenticated", () => {
    expect(
      shouldForceResolvePendingAuth({
        isAuthenticated: false,
        isEntitlementVerified: true,
        hasPendingAuthRequest: true,
      }),
    ).toBe(false);
  });

  it("does NOT resolve before entitlement reconciliation completes", () => {
    // The user is signed in (session confirmed) but entitlement has not been
    // reconciled yet; the resumed action must not run with an unreconciled tier.
    expect(
      shouldForceResolvePendingAuth({
        isAuthenticated: true,
        isEntitlementVerified: false,
        hasPendingAuthRequest: true,
      }),
    ).toBe(false);
  });

  it("does NOT resolve when there is no open pending auth request", () => {
    expect(
      shouldForceResolvePendingAuth({
        isAuthenticated: true,
        isEntitlementVerified: true,
        hasPendingAuthRequest: false,
      }),
    ).toBe(false);
  });

  it("does NOT resolve when nothing is ready (fresh mount)", () => {
    expect(
      shouldForceResolvePendingAuth({
        isAuthenticated: false,
        isEntitlementVerified: false,
        hasPendingAuthRequest: false,
      }),
    ).toBe(false);
  });

  it("still resolves if entitlement flipped to verified AFTER auth was already true", () => {
    // Regression case for the reported bug: the sessions sync completes the
    // auth step (isAuthenticated true) but its `finally` (which normally calls
    // finishPending) was skipped by a superseding sync. Once entitlement is
    // reconciled (isEntitlementVerified true), the safety net must resolve the
    // still-pending request so the dialog closes and the UI unblocks.
    expect(
      shouldForceResolvePendingAuth({
        isAuthenticated: true,
        isEntitlementVerified: true,
        hasPendingAuthRequest: true,
      }),
    ).toBe(true);
  });
});
