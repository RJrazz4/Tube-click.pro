-- Ghost Intelligence v3 — unified rolling-24h credit ledger.
--
-- Replaces per-feature quota tables with a single ledger:
--   (user_id, action) -> last_consumed_at, runs_in_window, window_start.
--
-- Rules (mirrors the rolling-24h pattern established in
-- 202608130001_rolling_24h_quota.sql for clone_crush):
--   * Free users: 0 credits for all ghost actions (paywalled).
--   * Pro users: daily allowances per action (see GHOST_ACTION_LIMITS).
--   * Black-Ops Lane (black_op_lane = true): unlimited interrogate + squad,
--     elevated recon/dawn-patrol caps.
--
-- The clone_crush RPCs are UNTOUCHED; they remain the authoritative gate
-- for the original Chain-Loop feature. Ghost actions route exclusively
-- through the new `consume_ghost_action` / `get_ghost_quota` pair.

-- ---------------------------------------------------------------------------
-- 1. Black-Ops lane entitlement column.
-- ---------------------------------------------------------------------------
alter table public.referral_profiles
  add column if not exists black_op_lane boolean not null default false;

comment on column public.referral_profiles.black_op_lane is
  'Black-Ops Lane unlock - set by admin/grants table only. Elevates ghost-intel caps beyond Pro.';

-- ---------------------------------------------------------------------------
-- 2. Ghost usage ledger.
-- ---------------------------------------------------------------------------
create table if not exists public.ghost_usage (
  user_id          uuid not null references auth.users(id) on delete cascade,
  action           text not null,
  runs_in_window   int  not null default 0,
  window_start     timestamptz not null default now(),
  last_run_at      timestamptz not null default now(),
  total_runs       bigint not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (user_id, action)
);

alter table public.ghost_usage enable row level security;

-- Self-read only; all writes via SECURITY DEFINER functions below.
drop policy if exists ghost_usage_self_select on public.ghost_usage;
create policy ghost_usage_self_select on public.ghost_usage
  for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.ghost_usage from anon, authenticated;
grant select on public.ghost_usage to authenticated;

create index if not exists ghost_usage_user_action_idx
  on public.ghost_usage(user_id, action);

-- ---------------------------------------------------------------------------
-- 3. Action catalog (pro / black-ops daily caps; rolling 24h).
-- ---------------------------------------------------------------------------
-- interrogate = Ghost Interrogation chat turn (first message also pays index)
-- squad       = Ghost Intel Squad dossier
-- recon       = Ghost Visual Recon per-video ingestion
-- dawn_patrol = Dawn Patrol daily brief delivery
-- Guarded so the migration is safely re-runnable (CREATE TYPE has no
-- IF NOT EXISTS form).
do $ghost_action$
begin
  if not exists (
    select 1 from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
     where n.nspname = 'public' and t.typname = 'ghost_action'
  ) then
    create type public.ghost_action as enum ('interrogate', 'squad', 'recon', 'dawn_patrol');
  end if;
end
$ghost_action$;

-- ---------------------------------------------------------------------------
-- 4. RPC: get_ghost_tier() -> {tier, is_black_ops}. Centralized entitlement
--    probe so other RPCs don't duplicate the referral_profiles join.
-- ---------------------------------------------------------------------------
create or replace function public.get_ghost_tier()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid       uuid := auth.uid();
  v_is_pro  boolean := false;
  v_black   boolean := false;
  v_exp     timestamptz;
begin
  if uid is null then
    return jsonb_build_object('tier', 'guest', 'is_black_ops', false);
  end if;

  select rp.pro_tier_expires_at, rp.black_op_lane
    into v_exp, v_black
    from public.referral_profiles rp
   where rp.user_id = uid;

  v_is_pro := (v_exp is null or v_exp > now());
  -- Black-ops is meaningless without an active pro subscription.
  v_black := coalesce(v_black, false) and v_is_pro;

  return jsonb_build_object(
    'tier', case when v_is_pro then 'pro' else 'free' end,
    'is_black_ops', v_black
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. RPC: get_ghost_limits(tier, is_black_ops) -> {action: limit}. Pure
--    function (no side effects) so it's safe to call from clients or
--    other RPCs.
-- ---------------------------------------------------------------------------
create or replace function public.get_ghost_limits(p_tier text, p_black boolean)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  free_limits  jsonb := jsonb_build_object(
    'interrogate', 0,
    'squad',       0,
    'recon',       0,
    'dawn_patrol', 0
  );
  pro_limits   jsonb := jsonb_build_object(
    'interrogate', 30,   -- ~30 chat turns/day rolling
    'squad',       3,    -- 3 dossiers/day
    'recon',       2,    -- 2 video ingest jobs/day
    'dawn_patrol', 1     -- 1 daily brief
  );
  black_limits jsonb := jsonb_build_object(
    'interrogate', 200,
    'squad',       20,
    'recon',       20,
    'dawn_patrol', 2
  );
begin
  if p_tier = 'pro' and p_black then return black_limits; end if;
  if p_tier = 'pro'              then return pro_limits;   end if;
  return free_limits;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. RPC: get_ghost_quota() -> all-action snapshot for the active user.
-- ---------------------------------------------------------------------------
create or replace function public.get_ghost_quota()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid         uuid := auth.uid();
  v_tier      jsonb;
  v_limits    jsonb;
  v_tier_name text;
  v_black     boolean;
  v_out       jsonb := '{}'::jsonb;
  v_row       public.ghost_usage%rowtype;
  v_act       text;
  v_limit     int;
  v_used      int;
  v_window_end timestamptz;
  v_remaining_s int;
  v_reset_at  timestamptz;
begin
  if uid is null then
    return jsonb_build_object(
      'allowed', false,
      'code', 'AUTH_REQUIRED',
      'tier', 'guest',
      'is_black_ops', false,
      'actions', '{}'::jsonb
    );
  end if;

  v_tier := public.get_ghost_tier();
  v_tier_name := v_tier->>'tier';
  v_black := (v_tier->>'is_black_ops')::boolean;
  v_limits := public.get_ghost_limits(v_tier_name, v_black);

  for v_act in select unnest(enum_range(null::public.ghost_action))::text loop
    v_limit := (v_limits->>v_act)::int;

    select * into v_row from public.ghost_usage
      where user_id = uid and action = v_act;

    if v_row.user_id is null
       or v_row.last_run_at is null
       or v_row.last_run_at < (now() - interval '24 hours') then
      v_used := 0;
      v_reset_at := null;
      v_remaining_s := 0;
    else
      v_used := v_row.runs_in_window;
      v_window_end := v_row.window_start + interval '24 hours';
      -- If the oldest tracked run is already outside the 24h window, reset.
      if v_window_end <= now() then
        v_used := 0;
        v_reset_at := null;
        v_remaining_s := 0;
      else
        v_reset_at := v_window_end;
        v_remaining_s := greatest(extract(epoch from (v_window_end - now()))::int, 0);
      end if;
    end if;

    v_out := v_out || jsonb_build_object(v_act, jsonb_build_object(
      'used',              v_used,
      'limit',             v_limit,
      'remaining',         greatest(v_limit - v_used, 0),
      'allowed',           (v_limit > v_used),
      'reset_at',          v_reset_at,
      'remaining_seconds', v_remaining_s,
      'total_runs',        coalesce(v_row.total_runs, 0)
    ));
  end loop;

  return jsonb_build_object(
    'allowed', true,
    'code', 'OK',
    'tier', v_tier_name,
    'is_black_ops', v_black,
    'actions', v_out
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. RPC: consume_ghost_action(p_user_id, p_action) -> atomic consume-and-return.
--    Called from Edge routes with service_role credentials (granted below).
--    The edge route authenticates the JWT and passes the resolved user_id
--    explicitly so we don't depend on set_config('request.jwt.claims', ...).
--    Returns the per-action verdict consistent with get_ghost_quota().
-- ---------------------------------------------------------------------------
create or replace function public.consume_ghost_action(p_user_id uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid          uuid := p_user_id;
  v_tier       jsonb;
  v_tier_name  text;
  v_black      boolean;
  v_limits     jsonb;
  v_limit      int;
  v_row        public.ghost_usage%rowtype;
  v_window_end timestamptz;
  v_used       int;
  v_remaining_s int;
  v_new_window boolean;
begin
  if uid is null then
    return jsonb_build_object('allowed', false, 'code', 'AUTH_REQUIRED', 'action', p_action);
  end if;

  -- Validate action name against enum (fail closed on typos).
  if p_action is null or p_action not in (select unnest(enum_range(null::public.ghost_action))::text) then
    return jsonb_build_object('allowed', false, 'code', 'INVALID_ACTION', 'action', p_action);
  end if;

  v_tier := public.get_ghost_tier_for(uid);
  v_tier_name := v_tier->>'tier';
  v_black := (v_tier->>'is_black_ops')::boolean;
  v_limits := public.get_ghost_limits(v_tier_name, v_black);
  v_limit := (v_limits->>p_action)::int;

  -- Free / zero-cap tier is rejected early (before writing any row).
  if v_limit <= 0 then
    return jsonb_build_object(
      'allowed', false,
      'code', 'PAYWALL',
      'action', p_action,
      'tier', v_tier_name,
      'is_black_ops', v_black,
      'used', 0,
      'limit', 0,
      'remaining', 0,
      'reset_at', null::timestamptz,
      'remaining_seconds', null::int,
      'total_runs', 0
    );
  end if;

  -- Upsert ledger row with rolling-24h reset.
  insert into public.ghost_usage as gu (user_id, action, runs_in_window, window_start, last_run_at, total_runs, created_at, updated_at)
  values (uid, p_action, 0, now(), now(), 0, now(), now())
  on conflict (user_id, action) do update
    set runs_in_window = case
          when gu.last_run_at is null
               or gu.last_run_at < (now() - interval '24 hours') then 0
          else gu.runs_in_window
        end,
        window_start = case
          when gu.last_run_at is null
               or gu.last_run_at < (now() - interval '24 hours') then now()
          else gu.window_start
        end,
        last_run_at = now(),
        total_runs = gu.total_runs + 1,
        updated_at = now()
  returning * into v_row;

  v_new_window := (v_row.runs_in_window = 0);
  v_used := v_row.runs_in_window;
  v_window_end := v_row.window_start + interval '24 hours';

  if v_used >= v_limit then
    v_remaining_s := greatest(extract(epoch from (v_window_end - now()))::int, 0);
    return jsonb_build_object(
      'allowed', false,
      'code', 'DAILY_LIMIT',
      'action', p_action,
      'tier', v_tier_name,
      'is_black_ops', v_black,
      'used', v_used,
      'limit', v_limit,
      'remaining', 0,
      'reset_at', v_window_end,
      'remaining_seconds', v_remaining_s,
      'total_runs', v_row.total_runs
    );
  end if;

  -- Commit the consume.
  update public.ghost_usage
     set runs_in_window = runs_in_window + 1,
         last_run_at = now(),
         total_runs = total_runs + case when v_new_window then 1 else 0 end,
         updated_at = now()
   where user_id = uid and action = p_action
  returning * into v_row;

  v_used := v_row.runs_in_window;
  v_window_end := v_row.window_start + interval '24 hours';
  v_remaining_s := greatest(extract(epoch from (v_window_end - now()))::int, 0);

  return jsonb_build_object(
    'allowed', true,
    'code', 'OK',
    'action', p_action,
    'tier', v_tier_name,
    'is_black_ops', v_black,
    'used', v_used,
    'limit', v_limit,
    'remaining', greatest(v_limit - v_used, 0),
    'reset_at', v_window_end,
    'remaining_seconds', v_remaining_s,
    'total_runs', v_row.total_runs
  );
end;
$$;

-- Internal helper: resolve tier for an explicit user_id (service_role path).
create or replace function public.get_ghost_tier_for(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_is_pro boolean := false;
  v_black  boolean := false;
  v_exp    timestamptz;
begin
  if p_user_id is null then
    return jsonb_build_object('tier', 'guest', 'is_black_ops', false);
  end if;
  select rp.pro_tier_expires_at, rp.black_op_lane
    into v_exp, v_black
    from public.referral_profiles rp
   where rp.user_id = p_user_id;
  v_is_pro := (v_exp is null or v_exp > now());
  v_black  := coalesce(v_black, false) and v_is_pro;
  return jsonb_build_object(
    'tier', case when v_is_pro then 'pro' else 'free' end,
    'is_black_ops', v_black
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Grants. clients/authenticated may read quotas; only service_role may
--    consume (consume is called server-side from Edge routes after tier
--    and cost are validated).
-- ---------------------------------------------------------------------------
revoke all on function public.get_ghost_tier()         from public, anon, authenticated;
revoke all on function public.get_ghost_tier_for(uuid) from public, anon, authenticated;
revoke all on function public.get_ghost_limits(text, boolean) from public, anon, authenticated;
revoke all on function public.get_ghost_quota()       from public, anon, authenticated;
revoke all on function public.consume_ghost_action(uuid, text) from public, anon, authenticated;

grant execute on function public.get_ghost_tier()         to authenticated, service_role;
grant execute on function public.get_ghost_limits(text, boolean) to authenticated, service_role;
grant execute on function public.get_ghost_quota()       to authenticated, service_role;
-- consume_ghost_action and get_ghost_tier_for are service_role only; edge
-- routes call them with the service key after verifying the JWT themselves.
grant execute on function public.get_ghost_tier_for(uuid) to service_role;
grant execute on function public.consume_ghost_action(uuid, text) to service_role;
