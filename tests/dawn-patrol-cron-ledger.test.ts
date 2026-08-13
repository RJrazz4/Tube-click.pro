import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/** Strip SQL/TS line comments so negative assertions can't match prose. */
const stripComments = (s: string) =>
  s
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith("--") && !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");

describe("Dawn Patrol cron — ledger enforcement", () => {
  const dawn = read("api/_dawnPatrol.ts");
  const code = stripComments(dawn);

  it("cron consumes a ghost credit before generating", () => {
    const cron = code.slice(code.indexOf("handleDawnPatrolCron"));
    expect(cron).toContain("consumeGhostActionForUser");
    // The consume must happen before the brief is generated.
    expect(cron.indexOf("consumeGhostActionForUser")).toBeLessThan(cron.indexOf("generateBrief"));
  });

  it("cron fails CLOSED — skips the user when the credit is refused", () => {
    const cron = code.slice(code.indexOf("handleDawnPatrolCron"));
    expect(cron).toMatch(/if\s*\(!verdict\.allowed\)/);
    expect(cron).toMatch(/continue;/);
  });

  it("cron records the real credit snapshot, not a bare source tag", () => {
    const cron = code.slice(code.indexOf("handleDawnPatrolCron"));
    expect(cron).toMatch(/p_credit_snapshot:\s*\{[\s\S]*?remaining:\s*verdict\.remaining/);
  });

  it("interactive path still uses the JWT-verifying entry point", () => {
    const gen = code.slice(0, code.indexOf("handleDawnPatrolCron"));
    expect(gen).toMatch(/consumeGhostAction\(req,\s*DAWN_ACTION\)/);
  });
});

describe("Dawn Patrol — niche persistence", () => {
  const dawn = stripComments(read("api/_dawnPatrol.ts"));
  const mig = read("supabase/migrations/202608140008_dawn_patrol_niche_persist.sql");
  const sql = stripComments(mig);

  it("interactive generate writes the niche back to the profile", () => {
    expect(dawn).toContain("ghost_dawn_patrol_set_niche");
  });

  it("writer is SECURITY DEFINER with a pinned search_path", () => {
    expect(sql).toMatch(/create or replace function public\.ghost_dawn_patrol_set_niche/);
    expect(sql).toMatch(/security definer/);
    expect(sql).toMatch(/set search_path = public, pg_temp/);
  });

  it("writer is service_role only — never client-callable", () => {
    expect(sql).toMatch(/revoke all on function public\.ghost_dawn_patrol_set_niche\(uuid, text\) from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.ghost_dawn_patrol_set_niche\(uuid, text\) to service_role/);
    expect(sql).not.toMatch(/grant execute on function public\.ghost_dawn_patrol_set_niche[^;]*to[^;]*authenticated/);
  });

  it("blank niche is a no-op so an empty field cannot wipe a stored value", () => {
    expect(sql).toMatch(/nullif\(btrim\(coalesce\(p_niche, ''\)\), ''\)/);
    expect(sql).toMatch(/v_clean is null/);
  });

  it("backfill only fills NULLs and takes the most recent brief", () => {
    expect(sql).toMatch(/and rp\.niche is null/);
    expect(sql).toMatch(/distinct on \(b\.user_id\)/);
    expect(sql).toMatch(/order by b\.user_id, b\.brief_date desc/);
  });
});

describe("Entitlement consistency (202608140007)", () => {
  const sql = stripComments(read("supabase/migrations/202608140007_entitlement_consistency.sql"));

  it("dawn patrol due-users gates on is_pro(), not a NULL-expiry test", () => {
    expect(sql).toMatch(/public\.is_pro\(rp\.user_id\)/);
    const due = sql.slice(sql.indexOf("ghost_dawn_patrol_due_users"));
    const body = due.slice(0, due.indexOf("$fn$;"));
    expect(body).not.toMatch(/pro_tier_expires_at is null/);
  });

  it("clone-crush functions route through is_pro()", () => {
    expect(sql).toMatch(/create or replace function public\.get_clone_crush_quota/);
    expect(sql).toMatch(/create or replace function public\.consume_clone_crush_run/);
    const occurrences = sql.match(/v_is_pro := public\.is_pro\(uid\)/g) || [];
    expect(occurrences.length).toBe(2);
  });

  it("adds the niche column that due-users reads", () => {
    expect(sql).toMatch(/add column if not exists niche text/);
  });
});
