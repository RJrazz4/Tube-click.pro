/**
 * Phase 4 — API integration tests for the Anti-Spam 2-Node Referral Engine.
 *
 * These assert on the wiring between the edge layer and the SQL engine, which
 * is where this arc could realistically regress. The SQL semantics themselves
 * are verified separately against a real PostgreSQL instance; here we lock in
 * the contract the API must uphold:
 *
 *   1. No call site references an RPC the Phase 4 migration dropped. A stale
 *      reference would surface as a runtime 500 only after deploy.
 *   2. Proof-of-work fires exactly at the metered choke points, and only when
 *      the action was actually allowed.
 *   3. The client is never told why a referral was rejected.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

const referralsApi = read("../api/referrals.ts");
const ghostLedger = read("../api/_ghostLedger.ts");
const cloneCrush = read("../api/clone-crush.ts");
const referralClient = read("../src/lib/referrals/client.ts");
const migration = read("../supabase/migrations/202608140006_antispam_2node_referral_engine.sql");
const dawnPatrol = read("../supabase/migrations/202608140005_ghost_dawn_patrol.sql");

const DROPPED_RPCS = [
  "claim_referral_reward",
  "record_referral_click",
  "evaluate_qualified_referral_chain",
];

describe("no stale references to dropped RPCs", () => {
  const sources = [
    ["api/referrals.ts", referralsApi],
    ["api/_ghostLedger.ts", ghostLedger],
    ["api/clone-crush.ts", cloneCrush],
    ["src/lib/referrals/client.ts", referralClient],
  ] as const;

  for (const rpc of DROPPED_RPCS) {
    for (const [name, source] of sources) {
      it(`${name} does not call ${rpc}`, () => {
        expect(source).not.toContain(`'${rpc}'`);
        expect(source).not.toContain(`"${rpc}"`);
      });
    }
  }
});

describe("migration drops legacy RPCs and defines replacements", () => {
  for (const rpc of DROPPED_RPCS) {
    it(`drops ${rpc}`, () => {
      expect(migration).toContain(`drop function if exists public.${rpc}`);
    });
  }

  it("defines the replacement surface", () => {
    for (const fn of [
      "attach_referral",
      "qualify_referral",
      "register_core_action",
      "validate_referral_code",
      "is_pro",
      "expire_pro_grants",
    ]) {
      expect(migration).toContain(`function public.${fn}`);
    }
  });
});

describe("referrals endpoint is on the 2-Node contract", () => {
  it("validates share-link clicks without writing a row", () => {
    expect(referralsApi).toContain("validate_referral_code");
    // A click is unauthenticated; recording one would let anonymous traffic
    // inflate a referrer's stats.
    expect(referralsApi).not.toContain("p_ip_hash: await ipHash(req),\n        p_ref_code");
  });

  it("attaches a pending attribution rather than granting a reward", () => {
    expect(referralsApi).toContain("attach_referral");
    expect(referralsApi).toContain("p_invitee_id");
    expect(referralsApi).toContain("p_device_hash");
  });

  it("never returns a rejection reason to the client", () => {
    // The engine records reasons server-side only; leaking them lets an
    // attacker iterate against the detector.
    expect(referralsApi).not.toContain("rejection_reason");
    expect(referralsApi).not.toContain("device_duplicate");
    expect(referralsApi).not.toContain("disposable_email");
  });

  it("derives a salted device fingerprint that is not reversible", () => {
    expect(referralsApi).toContain("async function deviceHash");
    expect(referralsApi).toContain("hmac(`device:v1:");
  });
});

describe("proof-of-work hooks", () => {
  it("ghost ledger registers only on an allowed action", () => {
    expect(ghostLedger).toContain("register_core_action");
    expect(ghostLedger).toContain("payload?.allowed === true");
  });

  it("clone crush registers only on an allowed run", () => {
    expect(cloneCrush).toContain("register_core_action");
    expect(cloneCrush).toContain("payload.allowed === true");
    expect(cloneCrush).toContain("'clone_crush_run'");
  });

  it("hooks are fire-and-forget so referral accounting cannot break an action", () => {
    expect(ghostLedger).toContain("void registerReferralProofOfWork");
    expect(cloneCrush).toContain("void registerReferralProofOfWork");
  });

  it("server-side allowlist gates which actions qualify", () => {
    expect(migration).toContain("array['interrogate', 'squad', 'recon', 'clone_crush_run']");
  });
});

describe("2-Node economics are server-authoritative", () => {
  it("requires 2 qualified referrals for 21 days, capped at 180", () => {
    expect(migration).toContain("'required_qualified_referrals', 2");
    expect(migration).toContain("'grant_days',                   21");
    expect(migration).toContain("'lifetime_day_cap',             180");
  });

  it("client reads thresholds from the server, not hardcoded copy", () => {
    expect(referralClient).toContain("requiredForReward");
    expect(referralClient).toContain("rewardDays");
  });

  it("entitlement has exactly one definition and NULL means Free", () => {
    expect(migration).toContain("function public.is_pro(uuid)");
    expect(migration).toContain("rp.pro_tier_expires_at is not null");

    // The defect being locked out: NULL expiry must never read as Pro. The
    // buggy expression is quoted in the header comment that documents it, so
    // strip comments and assert it never appears as executable code.
    const executable = migration
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n");
    expect(executable).not.toContain("v_exp is null or v_exp > now()");
  });
});

describe("dawn patrol cron scheduling (MP6 defect)", () => {
  it("uses distinct dollar-quote tags so the DO block parses", () => {
    expect(dawnPatrol).toContain("do $do$");
    expect(dawnPatrol).toContain("$cron$");
  });

  it("unschedules before scheduling so re-runs cannot duplicate the job", () => {
    expect(dawnPatrol).toContain("cron.unschedule('ghost-dawn-patrol-dispatch')");
  });

  it("no longer nests a bare $$ block inside the DO body", () => {
    const doBlock = dawnPatrol.slice(dawnPatrol.indexOf("do $do$"));
    // A bare $$ inside would terminate the outer body at parse time.
    expect(doBlock).not.toContain("\n      $$\n");
  });
});
