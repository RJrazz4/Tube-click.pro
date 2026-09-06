import { describe, expect, it } from "vitest";
import { shouldForceResolvePendingAuth } from "./softGateAuthDecision";

// The safety net may only resolve a pending sign-in request when the user is
// authenticated AND entitlement has fully settled (isEntitlementLoading false).
// The isEntitlementLoading guard is essential: the gated action that resumes
// after sign-in needs isTierReady (== !isAuthLoading && !isEntitlementLoading),
// so resolving while entitlement is still loading lets that action run before
// its session is ready and silently bail ("nothing happens" after login).
describe("shouldForceResolvePendingAuth (SoftGate overlay safety net)", () => {
  it("force-resolves when auth + entitlement settled + pending request (the happy unblock)", () => {
    expect(
      shouldForceResolvePendingAuth({
        isAuthenticated: true,
        isEntitlementVerified: true,
        isEntitlementLoading: false,
        hasPendingAuthRequest: true,
      }),
    ).toBe(true);
  });

  it("does NOT resolve while entitlement is still loading (action must run tier-ready)", () => {
    // Regression case for the after-login "nothing happens" bug: the session is
    // confirmed but entitlement hasn't finished. Resolving here would resume
    // the gated action while isTierReady is false -> it bails. Must stay open
    // until entitlement settles.
    expect(
      shouldForceResolvePendingAuth({
        isAuthenticated: true,
        isEntitlementVerified: true,
        isEntitlementLoading: true,
        hasPendingAuthRequest: true,
      }),
    ).toBe(false);
  });

  it("does NOT resolve when the user is not authenticated", () => {
    expect(
      shouldForceResolvePendingAuth({
        isAuthenticated: false,
        isEntitlementVerified: true,
        isEntitlementLoading: false,
        hasPendingAuthRequest: true,
      }),
    ).toBe(false);
  });

  it("does NOT resolve before entitlement reconciliation completes", () => {
    expect(
      shouldForceResolvePendingAuth({
        isAuthenticated: true,
        isEntitlementVerified: false,
        isEntitlementLoading: false,
        hasPendingAuthRequest: true,
      }),
    ).toBe(false);
  });

  it("does NOT resolve when there is no open pending auth request", () => {
    expect(
      shouldForceResolvePendingAuth({
        isAuthenticated: true,
        isEntitlementVerified: true,
        isEntitlementLoading: false,
        hasPendingAuthRequest: false,
      }),
    ).toBe(false);
  });

  it("does NOT resolve when nothing is ready (fresh mount)", () => {
    expect(
      shouldForceResolvePendingAuth({
        isAuthenticated: false,
        isEntitlementVerified: false,
        isEntitlementLoading: true,
        hasPendingAuthRequest: false,
      }),
    ).toBe(false);
  });

  it("still resolves when entitlement settles after auth was already confirmed", () => {
    // The superseding-sync fail-safe: the finally's finishPending was skipped by
    // a generation race, but once auth + entitlement settle (loading false),
    // the safety net must resolve the still-pending request so the dialog
    // closes and the action resumes tier-ready.
    expect(
      shouldForceResolvePendingAuth({
        isAuthenticated: true,
        isEntitlementVerified: true,
        isEntitlementLoading: false,
        hasPendingAuthRequest: true,
      }),
    ).toBe(true);
  });
});
