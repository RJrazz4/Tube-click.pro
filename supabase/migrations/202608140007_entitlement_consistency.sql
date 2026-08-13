-- ===========================================================================
-- 202608140007 — Entitlement consistency + dawn-patrol repair
-- ===========================================================================
-- Runs after 202608140006. Makes a FRESH build of the migration chain produce
-- the same correct schema that SUPABASE_CATCHUP_GHOST_FULL.sql produces on
-- production. Without this file the chain still applies without error but
-- leaves three real defects in place:
--
--   1. referral_profiles.niche does not exist, yet
--      ghost_dawn_patrol_due_users() selects rp.niche. Every call throws
--      ERROR: column rp.niche does not exist. Dawn Patrol has never worked
--      in any environment built from this chain.
--
--   2. ghost_dawn_patrol_due_users() gates on
--          (pro_tier_expires_at is null or pro_tier_expires_at > now())
--      A free user has NULL expiry, so that matches. Dawn Patrol is a Pro
--      feature - this would generate and bill briefs for the entire free
--      base. Same NULL-expiry defect class as BUG-1.
--
--   3. get_clone_crush_quota() / consume_clone_crush_run() still use
--          pro_unlocked_at is not null
--          and (pro_tier_expires_at is null or pro_tier_expires_at > now())
--      which disagrees with is_pro() whenever expiry is NULL. 202608140006's
--      header comment claims it repoints these onto is_pro(), but it never
--      redefines them - verified, zero occurrences.
--
-- is_pro() from 006 is the single source of truth. Everything below routes
-- through it so there is exactly one definition of Pro in the database.
-- ===========================================================================

-- ------------------------------------------------------------------
-- 1. The column ghost_dawn_patrol_due_users() reads.
-- ------------------------------------------------------------------
-- Nullable by design. api/_dawnPatrol.ts already coalesces (u?.niche || "").
alter table public.referral_profiles
  add column if not exists niche text;

comment on column public.referral_profiles.niche is
  'Creator niche used by the dawn-patrol briefing. Nullable - readers must coalesce.';

-- ------------------------------------------------------------------
-- 2. Dawn patrol due-list: real column + real entitlement.
-- ------------------------------------------------------------------
create or replace function public.ghost_dawn_patrol_due_users(p_utc_hour int)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
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
$fn$;

revoke all on function public.ghost_dawn_patrol_due_users(int) from public, anon, authenticated;
grant execute on function public.ghost_dawn_patrol_due_users(int) to service_role;

-- ------------------------------------------------------------------
-- 3. Clone & Crush onto is_pro(). Return shapes unchanged.
-- ------------------------------------------------------------------
create or replace function public.get_clone_crush_quota()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
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
$fn$;

create or replace function public.consume_clone_crush_run()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
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
$fn$;

revoke all on function public.consume_clone_crush_run() from public, anon, authenticated;
revoke all on function public.get_clone_crush_quota()   from public, anon, authenticated;
grant execute on function public.get_clone_crush_quota()   to authenticated, service_role;
grant execute on function public.consume_clone_crush_run() to service_role;
