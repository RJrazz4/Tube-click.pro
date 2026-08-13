-- Rolling 24h quota for Clone & Crush (was UTC-day rollover which could gift
-- early-morning runs). This is a single-run-per-24h sliding window; Pro
-- entitlement still bypasses entirely.
--
-- This migration is backwards compatible: existing daily_usage rows are
-- migrated by treating last_run_at as the start of the rolling 24h window.

alter table public.daily_usage
  drop constraint if exists daily_usage_runs_today_check;

-- The rolling window is keyed entirely by last_run_at; runs_today remains
-- for observability but gating is:
--   allowed = (now() - last_run_at > 24h) OR is_pro.

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

  select exists (
    select 1
      from public.referral_profiles rp
     where rp.user_id = uid
       and (rp.pro_unlocked_at is not null)
       and (rp.pro_tier_expires_at is null or rp.pro_tier_expires_at > now())
  ) into v_is_pro;

  if v_is_pro then
    insert into public.daily_usage (user_id, runs_today, window_start, last_run_at, created_at, updated_at)
    values (uid, 1, now(), now(), now(), now())
    on conflict (user_id) do update
      set runs_today = public.daily_usage.runs_today + 1,
          last_run_at = now(),
          updated_at  = now();
    return jsonb_build_object(
      'allowed', true,
      'code', 'OK',
      'tier', 'pro',
      'used_today', 0,
      'limit', null::int,
      'remaining', null::int,
      'reset_at', null::timestamptz,
      'remaining_seconds', null::int
    );
  end if;

  -- Upsert: if last_run_at is older than 24h (or no row), start a fresh window.
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
      'allowed', false,
      'code', 'DAILY_LIMIT',
      'tier', 'free',
      'used_today', 1,
      'limit', 1,
      'remaining', 0,
      'reset_at', v_window_end,
      'remaining_seconds', v_remaining_s
    );
  end if;

  update public.daily_usage
     set runs_today = runs_today + 1,
         last_run_at = now(),
         window_start = coalesce(window_start, now()),
         updated_at  = now()
   where user_id = uid;

  v_window_end := now() + interval '24 hours';
  return jsonb_build_object(
    'allowed', true,
    'code', 'OK',
    'tier', 'free',
    'used_today', 1,
    'limit', 1,
    'remaining', 0,
    'reset_at', v_window_end,
    'remaining_seconds', 24*60*60
  );
end;
$$;

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

  select exists (
    select 1 from public.referral_profiles rp
     where rp.user_id = uid
       and rp.pro_unlocked_at is not null
       and (rp.pro_tier_expires_at is null or rp.pro_tier_expires_at > now())
  ) into v_is_pro;

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

revoke all on function public.consume_clone_crush_run() from public, anon, authenticated;
revoke all on function public.get_clone_crush_quota()   from public, anon, authenticated;
grant execute on function public.get_clone_crush_quota() to authenticated, service_role;
grant execute on function public.consume_clone_crush_run() to service_role;
