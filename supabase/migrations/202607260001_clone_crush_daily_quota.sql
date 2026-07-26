-- Clone & Crush: 1 free Chain-Loop execution per 24h per authenticated user.
-- Pro users (qualified referral loop OR admin-granted entitlement) bypass the cap.

create table if not exists public.daily_usage (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  runs_today    int  not null default 0 check (runs_today >= 0),
  window_start  timestamptz not null default date_trunc('day', now() at time zone 'UTC'),
  last_run_at   timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.daily_usage enable row level security;

-- Users may read only their own counter; all writes happen via SECURITY DEFINER functions.
drop policy if exists daily_usage_self_select on public.daily_usage;
create policy daily_usage_self_select on public.daily_usage
  for select to authenticated
  using (auth.uid() = user_id);

revoke all on public.daily_usage from anon, authenticated;
grant select on public.daily_usage to authenticated;

-- Atomic "consume one run" for the current UTC day.
-- Returns JSONB: { allowed:bool, code:text, remaining:int|null, reset_at:timestamptz|null, is_pro:bool }.
create or replace function public.consume_clone_crush_run()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid          uuid := auth.uid();
  v_is_pro     boolean := false;
  v_row        public.daily_usage%rowtype;
  v_reset_at   timestamptz;
  v_remaining  int;
begin
  if uid is null then
    return jsonb_build_object('allowed', false, 'code', 'AUTH_REQUIRED');
  end if;

  -- Pro bypass: qualified via referral loop OR admin-granted entitlement OR active expiry window.
  select exists (
    select 1
      from public.referral_profiles rp
     where rp.user_id = uid
       and (rp.pro_unlocked_at is not null)
       and (rp.pro_tier_expires_at is null or rp.pro_tier_expires_at > now())
  ) into v_is_pro;

  if v_is_pro then
    return jsonb_build_object(
      'allowed', true,
      'code', 'OK',
      'tier', 'pro',
      'remaining', null::int,
      'reset_at', null::timestamptz
    );
  end if;

  -- Upsert: reset counter at UTC day rollover; otherwise increment.
  insert into public.daily_usage (user_id, runs_today, window_start, last_run_at, created_at, updated_at)
  values (uid, 0, date_trunc('day', now() at time zone 'UTC'), now(), now(), now())
  on conflict (user_id) do update
    set runs_today = case
          when public.daily_usage.window_start < date_trunc('day', now() at time zone 'UTC') then 0
          else public.daily_usage.runs_today
        end,
        window_start = date_trunc('day', now() at time zone 'UTC'),
        last_run_at  = now(),
        updated_at   = now()
  returning * into v_row;

  v_reset_at := v_row.window_start + interval '1 day';

  if v_row.runs_today >= 1 then
    return jsonb_build_object(
      'allowed', false,
      'code', 'DAILY_LIMIT',
      'tier', 'free',
      'remaining', 0,
      'reset_at', v_reset_at,
      'remaining_seconds', extract(epoch from (v_reset_at - now()))::int
    );
  end if;

  update public.daily_usage
     set runs_today = runs_today + 1,
         updated_at = now()
   where user_id = uid;

  v_remaining := 0; -- free tier is capped at 1
  return jsonb_build_object(
    'allowed', true,
    'code', 'OK',
    'tier', 'free',
    'remaining', v_remaining,
    'reset_at', v_reset_at,
    'remaining_seconds', extract(epoch from (v_reset_at - now()))::int
  );
end;
$$;

-- Read-only "peek" at current allowance without consuming a credit.
create or replace function public.get_clone_crush_quota()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid         uuid := auth.uid();
  v_is_pro    boolean := false;
  v_row       public.daily_usage%rowtype;
  v_reset_at  timestamptz;
  v_runs      int;
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
      'remaining', null::int, 'reset_at', null::timestamptz
    );
  end if;

  select * into v_row from public.daily_usage where user_id = uid;
  if v_row.user_id is null
     or v_row.window_start < date_trunc('day', now() at time zone 'UTC') then
    v_runs := 0;
    v_reset_at := date_trunc('day', now() at time zone 'UTC') + interval '1 day';
  else
    v_runs := v_row.runs_today;
    v_reset_at := v_row.window_start + interval '1 day';
  end if;

  return jsonb_build_object(
    'allowed', v_runs < 1,
    'code', case when v_runs < 1 then 'OK' else 'DAILY_LIMIT' end,
    'tier', 'free',
    'used_today', v_runs,
    'limit', 1,
    'remaining', greatest(1 - v_runs, 0),
    'reset_at', v_reset_at,
    'remaining_seconds', greatest(extract(epoch from (v_reset_at - now()))::int, 0)
  );
end;
$$;

revoke all on function public.consume_clone_crush_run()
  from public, anon, authenticated;
revoke all on function public.get_clone_crush_quota()
  from public, anon, authenticated;

-- Service role calls consume (server-side gate in clone-crush.ts).
-- Authenticated users may peek their own allowance (for UI rendering).
grant execute on function public.get_clone_crush_quota() to authenticated, service_role;
grant execute on function public.consume_clone_crush_run() to service_role;
