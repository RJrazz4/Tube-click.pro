import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/202607210003_qualified_referral_chain.sql", import.meta.url),
  "utf8",
);

describe("qualified referral chain migration", () => {
  it("requires three verified invites and one Pro-unlocked friend", () => {
    expect(migration).toContain("invite_count >= 3");
    expect(migration).toContain("unlocked_friend_count >= 1");
    expect(migration).toContain("referred_profile.pro_unlocked_at is not null");
  });

  it("propagates unlocks to the referrer without granting on signup alone", () => {
    expect(migration).toContain("evaluate_qualified_referral_chain(parent_user_id");
    expect(migration).not.toContain("greatest(now(), coalesce(profile_row.pro_tier_expires_at");
    expect(migration).toContain("perform public.evaluate_qualified_referral_chain(profile_row.user_id, 0)");
  });

  it("provides a service-role-only seed escape hatch", () => {
    expect(migration).toContain("admin_grant_seed_pro");
    expect(migration).toContain("grant execute on function public.admin_grant_seed_pro(uuid, integer) to service_role");
    expect(migration).toContain("revoke all on function public.admin_grant_seed_pro(uuid, integer) from public, anon, authenticated");
  });
});
