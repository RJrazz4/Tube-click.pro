# Ghost Intelligence Catch-Up — Apply Guide

Project: `cssnxomfkrnjaedoobjj` · Apply via the Supabase SQL Editor. There is no
deploy automation; a git push does **not** apply schema.

---

## What's wrong right now

Production contains exactly four tables:

```
referral_attributions   referral_blocked_domains
referral_pro_grants     referral_profiles
```

Those are precisely what `202608140006_antispam_2node_referral_engine.sql`
creates. It is the **only** migration ever applied. Consequences:

| Subsystem | Table | State |
|---|---|---|
| Ghost credit ledger | `ghost_usage` | missing |
| Ghost Interrogate | `ghost_memory_chunks` | missing |
| Ghost Squad | `ghost_squad_briefs` | missing |
| Visual Recon | `ghost_recon_frames` | missing |
| Dawn Patrol | `ghost_dawn_patrol_briefs` | missing |
| Clone & Crush quota | `daily_usage` | missing |

`api/_ghostLedger.ts` calls `get_ghost_quota` and `consume_ghost_action`, which
do not exist. Every metered Ghost action is failing in production.

The 2-node referral engine itself **is** correctly installed and working.

---

## Why you cannot just replay 202608140001–005

Migration 006 is newer than the Ghost migrations but was applied first.
Replaying the older files on top of it reintroduces defects that 006 fixes.
Both were reproduced on a local PostgreSQL 17 rebuild of your exact production
state before the repair was written.

### Defect 1 — free users get Pro (critical, revenue-affecting)

`202608140001` and `202608140005` define `get_ghost_tier_for()` using the old
rule `v_is_pro := (v_exp is null or v_exp > now())`. A new free user has
`pro_tier_expires_at = NULL`, so that returns **true**. Measured after a naive
chronological replay:

```
is_pro('<free user>')             -> f            (correct)
get_ghost_tier_for('<free user>') -> {"tier":"pro"}   <-- WRONG
```

Every free user would receive Pro-tier Ghost limits. This is BUG-1, already
fixed by 006 STEP 6/7 — the replay silently undoes it.

### Defect 2 — Dawn Patrol has never worked

`202608140005` reads `rp.niche`, a column **no migration in the repo creates**.
`ghost_dawn_patrol_due_users()` therefore throws
`ERROR: column rp.niche does not exist` on every call. This is pre-existing: it
fails identically on a clean full-chain replay.

### Defect 3 — Dawn Patrol would bill the entire free base

The same NULL-expiry filter appears in `ghost_dawn_patrol_due_users()`. Once
defect 2 is fixed, a brand-new free profile is returned as "due" for a brief —
a Pro feature generated for every free user. Caught during verification of
this repair, not present in any earlier audit.

### Defect 4 — Clone & Crush disagrees on entitlement

006's header comment claims it repoints the Clone & Crush functions onto
`is_pro()`, but it never redefines them (verified: 0 occurrences). They use
`pro_unlocked_at is not null and (expiry is null or expiry > now())`, which
disagrees with `is_pro()` whenever expiry is NULL.

All four are repaired by the catch-up script.

---

## Apply

### Step 1 — back up

Supabase Dashboard → Database → Backups → confirm a recent point-in-time
restore point exists.

### Note on the earlier `relation "v_black" does not exist` failure

The first bundle failed in the Supabase SQL Editor with
`ERROR: 42P01: relation "v_black" does not exist`.

The advisor attributed this to a forward reference — `consume_ghost_action`
calling `get_ghost_tier_for` before PART 3 defines it. **That diagnosis is
incorrect.** plpgsql resolves function calls at *runtime*, not parse time, so
definition order between functions does not matter; and `get_ghost_tier_for`
already exists in your database (migration 006 created it). Reordering would
have changed nothing.

The real cause is **client-side statement splitting**. The SQL Editor splits a
script into statements before sending it. Three comment lines in the old bundle
contained a literal `$$` while explaining the MP7 dollar-quote bug:

```
-- inside a $$-quoted DO body. PostgreSQL terminates the outer body at the
```

The splitter counts those as real dollar-quote delimiters, loses track of which
function body it is inside, and cuts a later `create function` in half. The
tail — `select coalesce(rp.black_op_lane, false) into v_black from ...` — is
then sent as a standalone statement. At top level `v_black` is not a plpgsql
variable, so Postgres reads it as a table name and reports 42P01.

This is why the file applied cleanly under `psql -f` and as a single query, but
failed in the Editor: only the Editor splits.

The corrected bundle is immune to splitting regardless of the client:

- every function body uses a unique tag (`$fn001$` … `$fn026$`); zero bare `$$`
- no comment line contains `$` or `;`
- no string literal contains `;`

Measured with a statement splitter: the old bundle produced **68** orphaned
fragments, the corrected one produces **0**.

### Step 2 — run the catch-up

Paste **`SUPABASE_CATCHUP_GHOST_FULL.sql`** (the generated bundle with all five
migrations inlined) into the SQL Editor and run it.

- Wrapped in `begin … commit` — all-or-nothing.
- Idempotent; verified clean across three consecutive runs.
- Creates no duplicate rows and modifies no existing row.
- Expect `NOTICE … already exists, skipping` lines. Those are normal.

`SUPABASE_CATCHUP_GHOST.sql` is the same script with the five migrations
referenced rather than inlined — read that one to review the logic.

### Step 3 — verify (all five must pass)

```sql
-- V1  expect 10 rows
select tablename from pg_tables where schemaname='public' order by 1;

-- V2  expect is_pro=f and ghost_tier='free' for every row
select rp.user_id,
       public.is_pro(rp.user_id)                       as is_pro,
       public.get_ghost_tier_for(rp.user_id) ->> 'tier' as ghost_tier
  from public.referral_profiles rp
 where rp.pro_tier_expires_at is null
 limit 5;

-- V3  expect a jsonb array (usually []), NOT an error
select public.ghost_dawn_patrol_due_users(7);

-- V4  expect 3 rows
select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public'
   and proname in ('get_ghost_quota','consume_ghost_action','register_core_action')
 order by 1;

-- V5  expect 0 rows
select tablename, policyname, cmd from pg_policies
 where schemaname='public'
   and ((qual ~* 'auth\.(uid|jwt|role)\(\)' and qual !~* 'select\s+auth\.')
     or (with_check ~* 'auth\.(uid|jwt|role)\(\)' and with_check !~* 'select\s+auth\.'));
```

### Step 4 — RLS

V5 should already return 0; the catch-up creates policies in the InitPlan form.
If it returns rows, run `SUPABASE_PATCH_RLS_INITPLAN.sql` once.

---

## Do NOT run

`202607210001` – `202607210004` and `supabase/combined_referrals.sql`.

They recreate `referral_events` and the legacy
`claim_referral_reward` / `evaluate_qualified_referral_chain` surface that 006
deliberately dropped. Running them would corrupt the 2-node engine.

---

## Verification performed

Rebuilt production exactly (harness + migration 006 → 4 tables), then applied
the catch-up on PostgreSQL 17.10.

| Gate | Result |
|---|---|
| Catch-up applies clean | pass |
| Idempotent, 3 consecutive runs | pass |
| V1 — 10 tables | pass |
| V2 — free user is_pro=f, tier=free | pass |
| V2 — Pro user (+21d) is_pro=t, tier=pro | pass |
| V2 — expired user is_pro=f, tier=free | pass |
| V3 — free user NOT due for Dawn Patrol | pass (`[]`) |
| V3 — Pro user IS due, niche populated | pass |
| V4 — 3 Ghost RPCs present | pass |
| V5 — 0 unwrapped RLS policies, 7 total | pass |
| End-to-end 2-node: signup alone grants nothing | pass |
| End-to-end 2-node: 2 × proof-of-work → Pro, 21 days | pass |
| Full 12-migration chain still clean | pass |
| Applies via `psql -f` | pass |
| Applies as ONE simple query | pass |
| Applies fragment-by-fragment (splitter client) | pass, 132/132 |
| Orphaned fragments under a splitter | 0 (was 68) |
| `tsc --noEmit` | 0 errors |
| `vitest run` | 61 files, 537 tests passed |

One repo change accompanies this: `202608140001_ghost_intel_ledger.sql` had a
bare `create type public.ghost_action` (no `IF NOT EXISTS` form exists for
`CREATE TYPE`), which made re-runs fail. It is now guarded by a `DO` block.

---

## Fresh environments: migration 202608140007

The catch-up script repairs **production**. A brand-new environment built by
replaying the migration chain was still broken, because three of the four
defects lived in the migration files themselves, not in production's state.
`202608140007_entitlement_consistency.sql` closes that gap.

Verified on a fresh 13-migration replay:

| Check | Before 007 | After 007 |
|---|---|---|
| `referral_profiles.niche` exists | no | yes |
| `ghost_dawn_patrol_due_users(7)` | throws 42703 | returns `[]` |
| due-users gates on `is_pro()` | no | yes |
| Clone & Crush calls `public.is_pro()` | no | yes |
| Free user due for Dawn Patrol | yes (would bill free base) | no |

Both routes now converge on an identical schema — 10 tables, 188 functions,
7 policies, 100 columns:

- production + `SUPABASE_CATCHUP_GHOST_FULL.sql` + `202608140007`
- fresh replay of all 13 migrations

You do **not** need to run 007 by hand after the catch-up. The catch-up
already contains these repairs; 007 exists so the migration chain produces
the same result on its own. Applying it anyway is harmless — it is idempotent
and was verified clean on top of the catch-up.

## Regenerating the bundle

`SUPABASE_CATCHUP_GHOST_FULL.sql` is generated. Do not hand-edit it.

```
node scripts/build-catchup-bundle.mjs           # rebuild
node scripts/build-catchup-bundle.mjs --check   # CI: stale or unsafe -> exit 1
```

The generator re-applies the splitter hardening (unique `$fnNNN$` tags, no `$`
or `;` in comments) and refuses to write a bundle that would produce orphaned
fragments. This is what prevents the `relation "v_black" does not exist`
failure from returning if the bundle is ever rebuilt.

---

## Migration 202608140008 — dawn-patrol niche + cron credits

Two follow-on defects, both in the Dawn Patrol path.

**Scheduled briefs were free and uncapped.** The cron called
`ghost_dawn_patrol_upsert` directly and never touched the ledger, because
`consumeGhostAction()` needs a caller JWT and the cron (authenticated by
`DAWN_PATROL_CRON_SECRET`) has none. A Pro user could exhaust their
`dawn_patrol` quota interactively and still be handed another brief by the
scheduler. The cron now goes through `consumeGhostActionForUser()`, the
server-side entry point, and fails **closed** — a refused credit skips that
user instead of generating.

**The niche was never stored.** `202608140007` added
`referral_profiles.niche` because `ghost_dawn_patrol_due_users()` selects it,
but nothing wrote it, so it stayed NULL and every scheduled brief was generic.
The value was already known at generate time — the client posts it and it is
saved on the brief row as `niche_snapshot` — it just never went back to the
profile. `ghost_dawn_patrol_set_niche()` now writes it, and the migration
backfills from each user's most recent brief so existing users get a correct
niche on the next cron run rather than after opening the app.

Verified on a 14-migration replay:

| Check | Result |
|---|---|
| Niche stored, trimmed, capped at 120 chars | pass |
| Blank input is a no-op (cannot wipe a stored niche) | pass |
| `due_users()` returns the stored niche | pass |
| Backfill picks the most recent brief | pass (`woodworking`, not `cooking`) |
| Backfill does not clobber an existing value | pass |
| Free user → `PAYWALL`, `allowed=false` | pass |
| Pro 1st brief allowed, 2nd → `DAILY_LIMIT` | pass |
| Writer is `service_role` only | pass |

The cron is now double-gated: `due_users()` excludes non-Pro, and
`consume_ghost_action` returns `PAYWALL` if one ever slips through.

`tests/dawn-patrol-cron-ledger.test.ts` (12 tests) locks this in. Confirmed
the three cron assertions **fail** against the pre-fix code, so they cannot
pass vacuously.
