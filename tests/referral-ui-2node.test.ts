import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const REFERRAL_UI = [
  "src/pages/Rewards.tsx",
  "src/components/referrals/ViralGrowthPass.tsx",
  "src/components/referrals/ViralOverdriveMiniBanner.tsx",
];

/** Strip JSX/TS comments so prose can't satisfy or break assertions. */
const stripComments = (s: string) =>
  s
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");

describe("Referral UI reflects the 2-Node engine", () => {
  it("no component hardcodes a 3-referral milestone", () => {
    for (const file of REFERRAL_UI) {
      const src = stripComments(read(file));
      // The old UI rendered `{inviteProgress}/3` and divided by a literal 3.
      expect(src, `${file} renders a hardcoded /3`).not.toMatch(/inviteProgress\}\/3/);
      expect(src, `${file} divides progress by a literal 3`).not.toMatch(/inviteProgress\s*\/\s*3\)/);
      expect(src, `${file} pads a 3-wide progress bar`).not.toMatch(/3\s*-\s*inviteProgress/);
    }
  });

  it("progress is denominated by requiredForReward from the RPC", () => {
    const rewards = stripComments(read("src/pages/Rewards.tsx"));
    expect(rewards).toMatch(/requiredForReward/);
    expect(rewards).toMatch(/\{inviteProgress\}\/\{requiredForReward\}/);

    const pass = stripComments(read("src/components/referrals/ViralGrowthPass.tsx"));
    expect(pass).toMatch(/\{inviteProgress\}\/\{milestoneTarget\}/);
  });

  it("the dropped chain-loop stage is gone from every component", () => {
    // 202608140006 dropped evaluate_qualified_referral_chain(). Any UI that
    // still asks the user to 'help 1 node unlock Elite' promises a step the
    // backend cannot deliver.
    for (const file of REFERRAL_UI) {
      const src = stripComments(read(file));
      expect(src, `${file} still renders the chain-loop stage`).not.toMatch(/unlockProgress/);
      expect(src, `${file} still says Elite Nodes`).not.toMatch(/Elite Nodes/i);
    }
  });

  it("reward duration comes from the RPC, never a hardcoded 7-Day Pass", () => {
    for (const file of REFERRAL_UI) {
      const src = stripComments(read(file));
      expect(src, `${file} advertises the legacy 7-Day Pass`).not.toMatch(/7-Day Pass/i);
      expect(src, `${file} advertises 7 Days Premium`).not.toMatch(/7 Days Premium/i);
    }
    expect(stripComments(read("src/pages/Rewards.tsx"))).toMatch(/rewardDays/);
    expect(stripComments(read("src/components/referrals/ViralGrowthPass.tsx"))).toMatch(/rewardDays/);
  });

  it("proof-of-work is stated: signups alone never qualify", () => {
    const rewards = read("src/pages/Rewards.tsx");
    expect(rewards).toMatch(/[Ss]ignups alone never/);
    expect(rewards).toMatch(/PROOF-OF-WORK|proof-of-work/i);
  });

  it("client maps every field the 2-node dashboard returns", () => {
    const client = read("src/lib/referrals/client.ts");
    for (const key of [
      "referral_code",
      "total_invites",
      "qualified_referrals",
      "pending_referrals",
      "required_for_reward",
      "reward_days",
      "pro_active",
      "pro_expires_at",
      "lifetime_days_granted",
      "lifetime_day_cap",
    ]) {
      expect(client, `client.ts does not read ${key}`).toContain(key);
    }
  });

  it("client never surfaces anti-abuse internals", () => {
    const client = read("src/lib/referrals/client.ts");
    expect(client).not.toMatch(/risk_score/);
    expect(client).not.toMatch(/rejection_reason/);
    expect(client).not.toMatch(/device_hash/);
    expect(client).not.toMatch(/ip_hash/);
  });
});
