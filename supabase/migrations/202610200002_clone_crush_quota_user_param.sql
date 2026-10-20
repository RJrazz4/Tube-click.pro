-- ===========================================================================
-- 202610200002 — Clone & Crush quota RPCs: take the caller as a parameter.
-- ===========================================================================
-- Root cause (2026-10-20, referral-E2E + Vercel-log proven): the no-arg
-- signatures consume_clone_crush_run() / get_clone_crush_quota() read the
-- caller from auth.uid(), but api/clone-crush.ts calls them over HTTP with
-- the SERVICE-ROLE key. A service-role JWT carries no user sub, so
-- auth.uid() was NULL on 100% of calls -> {allowed:false, code:'AUTH_REQUIRED'}
-- -> HTTP 401 for EVERY free-tier Chain-Loop, and the referral proof-of-work
-- hook (fired by the API layer only on payload.allowed===true) never fired,
-- so referrals could never qualify via Clone & Crush. Premium callers never
-- entered the quota stage, which is why the break was invisible on Pro.
--
-- This migration DROPs the no-arg signatures and recreates both functions
-- with a p_user_id uuid parameter, mirroring the established in-repo
-- pattern (get_pro_entitlement / consume_ghost_action): the API layer
-- verifies the caller's JWT and passes the resolved user id explicitly.
--
-- Bodies below are byte-faithful to 202608140007's definitions (quota
-- windows, daily_usage upserts, return shapes, is_pro() routing); only the
-- user source changes: `uid uuid := p_user_id` instead of `auth.uid()`.
-- A null/unknown p_user_id keeps the same AUTH_REQUIRED fail-closed as a
-- null auth.uid() did before.
--
-- PostgREST resolves RPCs by (name, argument list): keeping the old no-arg
-- signatures alongside the new ones would make every call ambiguous
-- (PGRST203). The old signatures MUST be dropped.
--
-- NOTE on grants: 202608140007 granted get_clone_crush_quota() to
-- authenticated as well as service_role. The p_user_id signature changes
-- the trust model — any authenticated caller could otherwise read or burn
-- another user's quota by passing their id — so the new signatures are
-- service_role ONLY. There is no in-repo caller except the API layer's
-- service-role path, so nothing legitimate loses access.
-- ===========================================================================

drop function if exists public.get_clone_crush_quota();
drop function if exists public.consume_clone_crush_run();

create or replace function public.get_clone_crush_quota(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  uid            uuid := p_user_id;
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

create or replace function public.consume_clone_crush_run(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  uid            uuid := p_user_id;
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

revoke all on function public.get_clone_crush_quota(uuid) from public, anon, authenticated;
revoke all on function public.consume_clone_crush_run(uuid) from public, anon, authenticated;
grant execute on function public.get_clone_crush_quota(uuid) to service_role;
grant execute on function public.consume_clone_crush_run(uuid) to service_role;
