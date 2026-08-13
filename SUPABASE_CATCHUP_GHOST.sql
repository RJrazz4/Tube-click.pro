-- ===========================================================================
-- GHOST INTELLIGENCE CATCH-UP  —  production repair script
-- ===========================================================================
-- Target project: cssnxomfkrnjaedoobjj
--
-- WHY THIS FILE EXISTS
-- --------------------
-- Production currently contains exactly four tables:
--     referral_attributions, referral_blocked_domains,
--     referral_pro_grants,   referral_profiles
-- Those are precisely the tables created by migration
-- 202608140006_antispam_2node_referral_engine.sql. Nothing else was ever
-- applied. The Ghost Intelligence subsystem (ledger, interrogate memory,
-- squad briefs, visual recon, dawn patrol) and the Clone & Crush quota
-- tables are absent, so api/_ghostLedger.ts is calling RPCs that do not
-- exist (get_ghost_quota, consume_ghost_action).
--
-- WHY YOU CANNOT JUST REPLAY 202608140001..005 IN ORDER
-- -----------------------------------------------------
-- Migration 006 is NEWER than the Ghost migrations but was applied FIRST.
-- Replaying the older files on top of it silently reintroduces two defects
-- that 006 exists to fix. Both were reproduced on a local PG 17 rebuild of
-- production before this file was written:
--
--   1. ENTITLEMENT REGRESSION (critical, revenue-affecting).
--      202608140001 and 202608140005 define get_ghost_tier_for() with the
--      old rule  v_is_pro := (v_exp is null or v_exp > now()).
--      A brand-new free user has pro_tier_expires_at = NULL, so that rule
--      returns TRUE. Measured after a naive chronological replay:
--          is_pro('<free user>')             -> f      (correct)
--          get_ghost_tier_for('<free user>') -> {"tier": "pro"}   (WRONG)
--      Every free user would be handed Pro-tier Ghost limits.
--      This is BUG-1, which 006 STEP 6/7 already fixed.
--
--   2. 202608140005 reads rp.niche, a column that is created by NO
--      migration in the repository. ghost_dawn_patrol_due_users() therefore
--      throws  ERROR: column rp.niche does not exist  on every call. This is
--      a PRE-EXISTING bug: it fails identically on a clean full-chain
--      replay, so the dawn-patrol cron has never worked. Repaired here.
--
-- WHAT THIS SCRIPT DOES NOT DO
-- ----------------------------
-- It does NOT run 202607210001..4. Those recreate referral_events and the
-- legacy claim_referral_reward / evaluate_qualified_referral_chain surface
-- that 006 deliberately dropped. They must never be applied now.
-- No existing row is modified. No table is dropped. Re-runnable.
--
-- ORDER OF OPERATIONS
--   PART 1  quota tables the Ghost ledger depends on
--   PART 2  the five Ghost migrations
--   PART 3  re-assert 006's entitlement contract (undoes clobber #1)
--   PART 4  repair the niche defect (#2) + repoint Clone & Crush to is_pro()
--   PART 5  verification
--
-- After this completes, run SUPABASE_PATCH_RLS_INITPLAN.sql once more: the
-- Ghost migrations create new RLS policies with unwrapped auth.uid().
-- ===========================================================================

begin;

-- ===========================================================================
-- PART 1 — Clone & Crush quota substrate (202607260001 + 202608130001)
-- ===========================================================================
-- daily_usage is required before the rolling-24h functions can compile.

create table if not exists public.daily_usage (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  runs_today   integer not null default 0,
  window_start timestamptz not null default now(),
  last_run_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.daily_usage enable row level security;

alter table public.daily_usage
  drop constraint if exists daily_usage_runs_today_check;

drop policy if exists daily_usage_self_select on public.daily_usage;
create policy daily_usage_self_select on public.daily_usage
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- ===========================================================================
-- PART 2 — Ghost Intelligence migrations 202608140001 .. 202608140005
-- ===========================================================================
-- Apply these by pasting the five migration files here, in this order,
-- BETWEEN the markers below. They are reproduced by reference rather than
-- inlined so this file cannot drift from the repository source of truth.
--
--   supabase/migrations/202608140001_ghost_intel_ledger.sql
--   supabase/migrations/202608140002_ghost_interrogate_memory.sql
--   supabase/migrations/202608140003_ghost_squad_briefs.sql
--   supabase/migrations/202608140004_ghost_visual_recon.sql
--   supabase/migrations/202608140005_ghost_dawn_patrol.sql
--
-- 202608140002 and 202608140004 require pgvector:
create extension if not exists vector;

-- >>>>>>>>>>>>>>>>  PASTE THE FIVE MIGRATION FILES HERE  <<<<<<<<<<<<<<<<<<<<
-- (see SUPABASE_CATCHUP_STEPS.md — the generated bundle
--  SUPABASE_CATCHUP_GHOST_FULL.sql already has them inlined for you)
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ===========================================================================
-- PART 3 — Re-assert the 006 entitlement contract
-- ===========================================================================
-- MUST run after PART 2. 202608140001 and 202608140005 both ship an older
-- get_ghost_tier_for() whose NULL-expiry branch grants Pro to free users.
-- These definitions are byte-identical to 006 STEP 7.

create or replace function public.get_ghost_tier_for(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_is_pro boolean;
  v_black  boolean;
begin
  if p_user_id is null then
    return jsonb_build_object('tier', 'guest', 'is_black_ops', false);
  end if;

  v_is_pro := public.is_pro(p_user_id);

  select coalesce(rp.black_op_lane, false)
    into v_black
    from public.referral_profiles rp
   where rp.user_id = p_user_id;

  -- Black-ops is meaningless without an active Pro subscription.
  v_black := coalesce(v_black, false) and v_is_pro;

  return jsonb_build_object(
    'tier', case when v_is_pro then 'pro' else 'free' end,
    'is_black_ops', v_black
  );
end;
$$;

create or replace function public.get_ghost_tier()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  return public.get_ghost_tier_for(auth.uid());
end;
$$;

revoke all on function public.get_ghost_tier() from public, anon;
grant execute on function public.get_ghost_tier() to authenticated, service_role;
revoke all on function public.get_ghost_tier_for(uuid) from public, anon, authenticated;
grant execute on function public.get_ghost_tier_for(uuid) to service_role;

-- ===========================================================================
-- PART 4 — Defect repairs
-- ===========================================================================

-- 4a. The missing niche column read by ghost_dawn_patrol_due_users().
--     Nullable by design; api/_dawnPatrol.ts already coalesces (u?.niche || "").
alter table public.referral_profiles
  add column if not exists niche text;

comment on column public.referral_profiles.niche is
  'Creator niche used by the dawn-patrol briefing. Nullable; readers must coalesce.';

-- 4a-bis. ghost_dawn_patrol_due_users() carries the SAME NULL-expiry defect
--     as get_ghost_tier_for(): its filter
--         (rp.pro_tier_expires_at is null or rp.pro_tier_expires_at > now())
--     matches every free user, so Dawn Patrol (a Pro feature) would be
--     generated and billed for the entire free base. Verified on the rebuild:
--     before this fix a brand-new free profile was returned by due_users(7).
--     Repointed onto is_pro(), and the missing niche column is now selected.

create or replace function public.ghost_dawn_patrol_due_users(p_utc_hour int)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_out jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', u.id,
    'email', u.email,
    'niche', rp.niche,
    'send_hour', rp.dawn_patrol_send_hour
  )), '[]'::jsonb)
    into v_out
    from public.referral_profiles rp
    join auth.users u on u.id = rp.user_id
   where rp.dawn_patrol_enabled = true
     and rp.dawn_patrol_send_hour = p_utc_hour
     and public.is_pro(rp.user_id)
     and not exists (
       select 1 from public.ghost_dawn_patrol_briefs b
        where b.user_id = rp.user_id
          and b.brief_date = (now() at time zone 'utc')::date
     );
  return v_out;
end;
$$;

revoke all on function public.ghost_dawn_patrol_due_users(int) from public, anon, authenticated;
grant execute on function public.ghost_dawn_patrol_due_users(int) to service_role;

-- 4b. Repoint Clone & Crush onto is_pro().
--     206's header comment claims it repoints these, but it never redefines
--     them - verified: 0 occurrences of consume_clone_crush_run in 006.
--     Left alone they use  pro_unlocked_at is not null
--                          and (expiry is null or expiry > now())
--     which disagrees with is_pro() whenever expiry is NULL.

create or replace function public.get_clone_crush_quota()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid            uuid := auth.uid();
  v_is_pro       boolean := false;
  v_row          public.daily_usage%rowtype;
  v_window_end   timestamptz;
  v_used         int;
  v_remaining_s  int;
begin
  if uid is null then
    return jsonb_build_object('allowed', false, 'code', 'AUTH_REQUIRED');
  end if;

  v_is_pro := public.is_pro(uid);

  if v_is_pro then
    return jsonb_build_object(
      'allowed', true, 'code', 'OK', 'tier', 'pro',
      'used_today', 0, 'limit', null::int,
      'remaining', null::int, 'reset_at', null::timestamptz,
      'remaining_seconds', null::int
    );
  end if;

  select * into v_row from public.daily_usage where user_id = uid;
  if v_row.user_id is null
     or v_row.last_run_at is null
     or v_row.last_run_at < (now() - interval '24 hours') then
    v_used := 0;
    v_window_end := null;
    v_remaining_s := 0;
  else
    v_used := 1;
    v_window_end := v_row.last_run_at + interval '24 hours';
    v_remaining_s := greatest(extract(epoch from (v_window_end - now()))::int, 0);
  end if;

  return jsonb_build_object(
    'allowed', v_used < 1,
    'code', case when v_used < 1 then 'OK' else 'DAILY_LIMIT' end,
    'tier', 'free',
    'used_today', v_used,
    'limit', 1,
    'remaining', greatest(1 - v_used, 0),
    'reset_at', v_window_end,
    'remaining_seconds', v_remaining_s
  );
end;
$$;

create or replace function public.consume_clone_crush_run()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid            uuid := auth.uid();
  v_is_pro       boolean := false;
  v_row          public.daily_usage%rowtype;
  v_window_end   timestamptz;
  v_remaining_s  int;
begin
  if uid is null then
    return jsonb_build_object('allowed', false, 'code', 'AUTH_REQUIRED');
  end if;

  v_is_pro := public.is_pro(uid);

  if v_is_pro then
    insert into public.daily_usage (user_id, runs_today, window_start, last_run_at, created_at, updated_at)
    values (uid, 1, now(), now(), now(), now())
    on conflict (user_id) do update
      set runs_today  = public.daily_usage.runs_today + 1,
          last_run_at = now(),
          updated_at  = now();
    return jsonb_build_object(
      'allowed', true, 'code', 'OK', 'tier', 'pro',
      'used_today', 0, 'limit', null::int,
      'remaining', null::int, 'reset_at', null::timestamptz,
      'remaining_seconds', null::int
    );
  end if;

  insert into public.daily_usage (user_id, runs_today, window_start, last_run_at, created_at, updated_at)
  values (uid, 0, now(), now(), now(), now())
  on conflict (user_id) do update
    set runs_today = case
          when public.daily_usage.last_run_at is null
               or public.daily_usage.last_run_at < (now() - interval '24 hours') then 0
          else public.daily_usage.runs_today
        end,
        window_start = case
          when public.daily_usage.last_run_at is null
               or public.daily_usage.last_run_at < (now() - interval '24 hours') then now()
          else public.daily_usage.window_start
        end,
        last_run_at = case
          when public.daily_usage.last_run_at is null
               or public.daily_usage.last_run_at < (now() - interval '24 hours') then now()
          else public.daily_usage.last_run_at
        end,
        updated_at = now()
  returning * into v_row;

  v_window_end := v_row.last_run_at + interval '24 hours';

  if v_row.runs_today >= 1 then
    v_remaining_s := greatest(extract(epoch from (v_window_end - now()))::int, 0);
    return jsonb_build_object(
      'allowed', false, 'code', 'DAILY_LIMIT', 'tier', 'free',
      'used_today', 1, 'limit', 1, 'remaining', 0,
      'reset_at', v_window_end, 'remaining_seconds', v_remaining_s
    );
  end if;

  update public.daily_usage
     set runs_today   = runs_today + 1,
         last_run_at  = now(),
         window_start = coalesce(window_start, now()),
         updated_at   = now()
   where user_id = uid;

  v_window_end := now() + interval '24 hours';
  return jsonb_build_object(
    'allowed', true, 'code', 'OK', 'tier', 'free',
    'used_today', 1, 'limit', 1, 'remaining', 0,
    'reset_at', v_window_end, 'remaining_seconds', 24*60*60
  );
end;
$$;

revoke all on function public.consume_clone_crush_run() from public, anon, authenticated;
revoke all on function public.get_clone_crush_quota()   from public, anon, authenticated;
grant execute on function public.get_clone_crush_quota()   to authenticated, service_role;
grant execute on function public.consume_clone_crush_run() to service_role;

commit;

-- ===========================================================================
-- PART 5 — VERIFICATION (run separately; all five must pass)
-- ===========================================================================
-- V1. All 10 expected tables present.
--     Expect: 10 rows.
-- select tablename from pg_tables where schemaname='public' order by 1;

-- V2. Entitlement contract intact — the regression guard.
--     Expect: is_pro=f AND tier='free' for any user with NULL expiry.
-- select rp.user_id,
--        public.is_pro(rp.user_id)                              as is_pro,
--        public.get_ghost_tier_for(rp.user_id) ->> 'tier'        as ghost_tier
--   from public.referral_profiles rp
--  where rp.pro_tier_expires_at is null
--  limit 5;

-- V3. Dawn patrol no longer throws on the missing column.
--     Expect: a jsonb array (usually []), NOT an error.
-- select public.ghost_dawn_patrol_due_users(7);

-- V4. Ghost RPCs the API calls now exist.
--     Expect: 3 rows.
-- select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--  where n.nspname='public'
--    and proname in ('get_ghost_quota','consume_ghost_action','register_core_action')
--  order by 1;

-- V5. No RLS policy left with an unwrapped auth.* call.
--     Expect: 0 rows. If non-zero, run SUPABASE_PATCH_RLS_INITPLAN.sql.
-- select tablename, policyname, cmd from pg_policies
--  where schemaname='public'
--    and ((qual ~* 'auth\.(uid|jwt|role)\(\)' and qual !~* 'select\s+auth\.')
--      or (with_check ~* 'auth\.(uid|jwt|role)\(\)' and with_check !~* 'select\s+auth\.'));
