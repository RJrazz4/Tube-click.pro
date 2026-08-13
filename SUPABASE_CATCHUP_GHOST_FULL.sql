-- ===========================================================================
-- GHOST INTELLIGENCE CATCH-UP  —  production repair script
-- ===========================================================================
-- Target project: cssnxomfkrnjaedoobjj
--
-- WHY THIS FILE EXISTS
-- ------------------------------
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
-- ------------------------------
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
-- ------------------------------
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

-- ~~~~~~~~~~~~~~~~ BEGIN 202608140001_ghost_intel_ledger.sql ~~~~~~~~~~~~~~~~
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
-- The clone_crush RPCs are UNTOUCHED. they remain the authoritative gate
-- for the original Chain-Loop feature. Ghost actions route exclusively
-- through the new `consume_ghost_action` / `get_ghost_quota` pair.

-- ------------------------------
-- 1. Black-Ops lane entitlement column.
-- ------------------------------
alter table public.referral_profiles
  add column if not exists black_op_lane boolean not null default false;

comment on column public.referral_profiles.black_op_lane is
  'Black-Ops Lane unlock - set by admin/grants table only. Elevates ghost-intel caps beyond Pro.';

-- ------------------------------
-- 2. Ghost usage ledger.
-- ------------------------------
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

-- Self-read only. all writes via SECURITY DEFINER functions below.
drop policy if exists ghost_usage_self_select on public.ghost_usage;
create policy ghost_usage_self_select on public.ghost_usage
  for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.ghost_usage from anon, authenticated;
grant select on public.ghost_usage to authenticated;

create index if not exists ghost_usage_user_action_idx
  on public.ghost_usage(user_id, action);

-- ------------------------------
-- 3. Action catalog (pro / black-ops daily caps. rolling 24h).
-- ------------------------------
-- interrogate = Ghost Interrogation chat turn (first message also pays index)
-- squad       = Ghost Intel Squad dossier
-- recon       = Ghost Visual Recon per-video ingestion
-- dawn_patrol = Dawn Patrol daily brief delivery
-- Guarded so the migration is safely re-runnable (CREATE TYPE has no
-- IF NOT EXISTS form).
do $fn001$
begin
  if not exists (
    select 1 from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
     where n.nspname = 'public' and t.typname = 'ghost_action'
  ) then
    create type public.ghost_action as enum ('interrogate', 'squad', 'recon', 'dawn_patrol');
  end if;
end
$fn001$;

-- ------------------------------
-- 4. RPC: get_ghost_tier() -> {tier, is_black_ops}. Centralized entitlement
--    probe so other RPCs don't duplicate the referral_profiles join.
-- ------------------------------
create or replace function public.get_ghost_tier()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn002$
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
$fn002$;

-- ------------------------------
-- 5. RPC: get_ghost_limits(tier, is_black_ops) -> {action: limit}. Pure
--    function (no side effects) so it's safe to call from clients or
--    other RPCs.
-- ------------------------------
create or replace function public.get_ghost_limits(p_tier text, p_black boolean)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn003$
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
$fn003$;

-- ------------------------------
-- 6. RPC: get_ghost_quota() -> all-action snapshot for the active user.
-- ------------------------------
create or replace function public.get_ghost_quota()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn004$
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
$fn004$;

-- ------------------------------
-- 7. RPC: consume_ghost_action(p_user_id, p_action) -> atomic consume-and-return.
--    Called from Edge routes with service_role credentials (granted below).
--    The edge route authenticates the JWT and passes the resolved user_id
--    explicitly so we don't depend on set_config('request.jwt.claims', ...).
--    Returns the per-action verdict consistent with get_ghost_quota().
-- ------------------------------
create or replace function public.consume_ghost_action(p_user_id uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn005$
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
$fn005$;

-- Internal helper: resolve tier for an explicit user_id (service_role path).
create or replace function public.get_ghost_tier_for(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn006$
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
$fn006$;

-- ------------------------------
-- 8. Grants. clients/authenticated may read quotas. only service_role may
--    consume (consume is called server-side from Edge routes after tier
--    and cost are validated).
-- ------------------------------
revoke all on function public.get_ghost_tier()         from public, anon, authenticated;
revoke all on function public.get_ghost_tier_for(uuid) from public, anon, authenticated;
revoke all on function public.get_ghost_limits(text, boolean) from public, anon, authenticated;
revoke all on function public.get_ghost_quota()       from public, anon, authenticated;
revoke all on function public.consume_ghost_action(uuid, text) from public, anon, authenticated;

grant execute on function public.get_ghost_tier()         to authenticated, service_role;
grant execute on function public.get_ghost_limits(text, boolean) to authenticated, service_role;
grant execute on function public.get_ghost_quota()       to authenticated, service_role;
-- consume_ghost_action and get_ghost_tier_for are service_role only. edge
-- routes call them with the service key after verifying the JWT themselves.
grant execute on function public.get_ghost_tier_for(uuid) to service_role;
grant execute on function public.consume_ghost_action(uuid, text) to service_role;

-- ~~~~~~~~~~~~~~~~ END 202608140001_ghost_intel_ledger.sql ~~~~~~~~~~~~~~~~

-- ~~~~~~~~~~~~~~~~ BEGIN 202608140002_ghost_interrogate_memory.sql ~~~~~~~~~~~~~~~~
-- Ghost Interrogation (chat-with-competitor) — transcript chunk memory.
--
-- Stores chunked+embedded transcript segments per (user_id, video_id) so
-- interrogate chat can do semantic retrieval over the competitor's words.
--
-- Embedding dimension 1536 aligns with text-embedding-3-small /
-- text-embedding-ada-002. we don't hard-pin a provider here — the edge
-- route chooses the cheapest capable embedder and the column type
-- accepts any vector(1536).
--
-- Idempotency: chunks PK is (user_id, video_id, chunk_index). repeated
-- indexing calls are upsert no-ops (ON CONFLICT DO NOTHING).

-- pgvector must be enabled on the project. In Supabase this ships as
-- an extension. the guard "if not exists" makes the migration safe to
-- re-run.
create extension if not exists vector schema public;

create table if not exists public.ghost_memory_chunks (
  user_id       uuid not null references auth.users(id) on delete cascade,
  slot_id       int  not null check (slot_id between 0 and 4),
  video_id      text not null,
  chunk_index   int  not null check (chunk_index >= 0),
  start_ts      double precision,
  end_ts        double precision,
  embedding     vector(1536),
  text          text not null,
  meta          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  primary key (user_id, video_id, chunk_index)
);

alter table public.ghost_memory_chunks enable row level security;

-- Self-read/insert via SECURITY DEFINER RPCs. direct inserts are not granted.
drop policy if exists ghost_memory_chunks_self_all on public.ghost_memory_chunks;
create policy ghost_memory_chunks_self_all on public.ghost_memory_chunks
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.ghost_memory_chunks from anon, authenticated;
grant select, insert, update, delete on public.ghost_memory_chunks to service_role;
-- Authenticated may only SELECT via RPC (we also grant select directly for
-- possible future debugging. RLS restricts to self rows).
grant select on public.ghost_memory_chunks to authenticated;

create index if not exists ghost_memory_chunks_user_video_idx
  on public.ghost_memory_chunks(user_id, video_id);

create index if not exists ghost_memory_chunks_embedding_idx
  on public.ghost_memory_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- ------------------------------
-- RPC: ghost_index_chunks(user_id, video_id, slot_id, chunks jsonb)
--        Upserts an ordered list of transcript chunks with embeddings.
--        Idempotent — existing (user_id, video_id, chunk_index) rows are
--        left untouched. new rows inserted.
-- ------------------------------
create or replace function public.ghost_index_chunks(
  p_user_id  uuid,
  p_video_id text,
  p_slot_id  int,
  p_chunks   jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn007$
declare
  v_chunk jsonb;
  v_ins   int := 0;
begin
  if p_user_id is null or p_video_id is null or p_chunks is null then
    return jsonb_build_object('inserted', 0, 'total', 0);
  end if;

  for v_chunk in select * from jsonb_array_elements(p_chunks) loop
    insert into public.ghost_memory_chunks
      (user_id, slot_id, video_id, chunk_index, start_ts, end_ts, embedding, text, meta)
    values (
      p_user_id,
      coalesce(p_slot_id, 0),
      p_video_id,
      (v_chunk->>'chunk_index')::int,
      (v_chunk->>'start_ts')::double precision,
      (v_chunk->>'end_ts')::double precision,
      case
        when v_chunk ? 'embedding' and jsonb_array_length(v_chunk->'embedding') = 1536
          then (select vector(string_agg((e::text), ','))
                  from jsonb_array_elements_text(v_chunk->'embedding') e)
        else null
      end,
      v_chunk->>'text',
      coalesce(v_chunk->'meta', '{}'::jsonb)
    )
    on conflict (user_id, video_id, chunk_index) do nothing;
    v_ins := v_ins + 1;
  end loop;

  return jsonb_build_object('inserted', v_ins, 'video_id', p_video_id);
end;
$fn007$;

-- ------------------------------
-- RPC: ghost_search_chunks(user_id, video_id, embedding, k) -> top-k chunks.
--        Returns an ordered list of {chunk_index, text, start_ts, end_ts,
--        meta, similarity} — similarity is 1 - cosine distance.
--        The caller supplies the embedding (computed at the edge). the DB
--        only handles vector similarity on already-indexed chunks.
-- ------------------------------
create or replace function public.ghost_search_chunks(
  p_user_id   uuid,
  p_video_id  text,
  p_embedding jsonb,
  p_k         int default 6
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn008$
declare
  v_query vector(1536);
  v_k     int := greatest(1, least(coalesce(p_k, 6), 12));
  v_out   jsonb;
begin
  if p_user_id is null or p_video_id is null or p_embedding is null then
    return '[]'::jsonb;
  end if;

  select vector(string_agg((e::text), ','))
    into v_query
    from jsonb_array_elements_text(p_embedding) e;

  if v_query is null then
    return '[]'::jsonb;
  end if;

  select coalesce(
    jsonb_agg(row_to_json(t)),
    '[]'::jsonb
  ) into v_out from (
    select c.chunk_index,
           c.text,
           c.start_ts,
           c.end_ts,
           c.meta,
           1 - (c.embedding <=> v_query) as similarity
      from public.ghost_memory_chunks c
     where c.user_id = p_user_id
       and c.video_id = p_video_id
       and c.embedding is not null
     order by c.embedding <=> v_query
     limit v_k
  ) t;

  return v_out;
end;
$fn008$;

-- ------------------------------
-- RPC: ghost_count_chunks(user_id, video_id) -> {count, has_embeddings}.
--        Used by the edge route to decide if indexing can be skipped (cache hit).
-- ------------------------------
create or replace function public.ghost_count_chunks(p_user_id uuid, p_video_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn009$
declare
  v_total         int := 0;
  v_with_embed    int := 0;
begin
  select count(*), count(embedding)
    into v_total, v_with_embed
    from public.ghost_memory_chunks
   where user_id = p_user_id
     and video_id = p_video_id;

  return jsonb_build_object(
    'count', v_total,
    'has_embeddings', (v_with_embed > 0)
  );
end;
$fn009$;

revoke all on function public.ghost_index_chunks(uuid, text, int, jsonb) from public, anon, authenticated;
revoke all on function public.ghost_search_chunks(uuid, text, jsonb, int) from public, anon, authenticated;
revoke all on function public.ghost_count_chunks(uuid, text) from public, anon, authenticated;

-- Only service_role may call the mutating/vector RPCs. the edge route
-- authenticates the JWT and then calls through the service key.
grant execute on function public.ghost_index_chunks(uuid, text, int, jsonb) to service_role;
grant execute on function public.ghost_search_chunks(uuid, text, jsonb, int) to service_role;
grant execute on function public.ghost_count_chunks(uuid, text) to service_role, authenticated;

-- ~~~~~~~~~~~~~~~~ END 202608140002_ghost_interrogate_memory.sql ~~~~~~~~~~~~~~~~

-- ~~~~~~~~~~~~~~~~ BEGIN 202608140003_ghost_squad_briefs.sql ~~~~~~~~~~~~~~~~
-- Ghost Intel Squad — multi-agent competitor dossier persistence.
--
-- One row per (user, slot, video) holds the full JSON dossier produced
-- by the Scout/Crawler/Analyst/Comparator agent chain. Idempotent
-- upsert on (user_id, video_id) so repeat clicks hit the cached brief
-- without re-burning a squad credit. the edge route performs a
-- slot-scoped lookup before consuming a credit.
--
-- Security model matches the ghost_memory_chunks table from MP3:
--   - RLS: self read/delete via authenticated. service_role full.
--   - Mutation is exclusively through a SECURITY DEFINER persist RPC
--     called by the edge route after it authenticates the JWT and
--     consumes a squad credit.

create table if not exists public.ghost_squad_briefs (
  user_id        uuid not null references auth.users(id) on delete cascade,
  slot_id        int  not null check (slot_id between 0 and 19),
  target_video_id text not null,
  payload        jsonb not null,
  model          text,
  cost_tokens    int  not null default 0,
  threat_level   int  not null default 0 check (threat_level between 0 and 100),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (user_id, target_video_id)
);

alter table public.ghost_squad_briefs enable row level security;

drop policy if exists ghost_squad_briefs_self_all on public.ghost_squad_briefs;
create policy ghost_squad_briefs_self_all on public.ghost_squad_briefs
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.ghost_squad_briefs from anon, authenticated;
grant select, insert, update, delete on public.ghost_squad_briefs to service_role;
grant select on public.ghost_squad_briefs to authenticated;

create index if not exists ghost_squad_briefs_user_slot_idx
  on public.ghost_squad_briefs(user_id, slot_id, created_at desc);

create index if not exists ghost_squad_briefs_user_video_idx
  on public.ghost_squad_briefs(user_id, target_video_id);

-- ------------------------------
-- RPC: ghost_upsert_squad_brief(user_id, slot_id, target_video_id, payload,
--        model, cost_tokens, threat_level)
--        Idempotent upsert. Returns the stored row's id + created_at.
-- ------------------------------
create or replace function public.ghost_upsert_squad_brief(
  p_user_id        uuid,
  p_slot_id        int,
  p_target_video_id text,
  p_payload        jsonb,
  p_model          text default null,
  p_cost_tokens    int  default 0,
  p_threat_level   int  default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn010$
declare
  v_existing_id uuid;
  v_created_at  timestamptz;
begin
  if p_user_id is null or p_target_video_id is null or p_payload is null then
    return jsonb_build_object('ok', false, 'error', 'missing_params');
  end if;

  insert into public.ghost_squad_briefs
    (user_id, slot_id, target_video_id, payload, model, cost_tokens, threat_level, created_at, updated_at)
  values
    (p_user_id,
     coalesce(p_slot_id, 0),
     p_target_video_id,
     p_payload,
     p_model,
     greatest(0, coalesce(p_cost_tokens, 0)),
     greatest(0, least(100, coalesce(p_threat_level, 0))),
     now(), now())
  on conflict (user_id, target_video_id) do update
    set payload     = excluded.payload,
        model       = excluded.model,
        cost_tokens = excluded.cost_tokens,
        threat_level = excluded.threat_level,
        slot_id     = excluded.slot_id,
        updated_at  = now()
  returning user_id, created_at into v_existing_id, v_created_at;

  return jsonb_build_object(
    'ok', true,
    'video_id', p_target_video_id,
    'created_at', v_created_at
  );
end;
$fn010$;

-- ------------------------------
-- RPC: ghost_get_squad_brief(user_id, target_video_id) -> payload jsonb or null.
--        Service-role only. edge route validates JWT first.
-- ------------------------------
create or replace function public.ghost_get_squad_brief(
  p_user_id        uuid,
  p_target_video_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn011$
declare
  v_row public.ghost_squad_briefs;
begin
  if p_user_id is null or p_target_video_id is null then
    return null;
  end if;

  select * into v_row
    from public.ghost_squad_briefs
   where user_id = p_user_id
     and target_video_id = p_target_video_id
   limit 1;

  if v_row is null then return null; end if;

  return jsonb_build_object(
    'payload', v_row.payload,
    'model', v_row.model,
    'cost_tokens', v_row.cost_tokens,
    'threat_level', v_row.threat_level,
    'created_at', v_row.created_at,
    'slot_id', v_row.slot_id
  );
end;
$fn011$;

revoke all on function public.ghost_upsert_squad_brief(uuid, int, text, jsonb, text, int, int) from public, anon, authenticated;
revoke all on function public.ghost_get_squad_brief(uuid, text) from public, anon, authenticated;

grant execute on function public.ghost_upsert_squad_brief(uuid, int, text, jsonb, text, int, int) to service_role;
grant execute on function public.ghost_get_squad_brief(uuid, text) to service_role;

-- ~~~~~~~~~~~~~~~~ END 202608140003_ghost_squad_briefs.sql ~~~~~~~~~~~~~~~~

-- ~~~~~~~~~~~~~~~~ BEGIN 202608140004_ghost_visual_recon.sql ~~~~~~~~~~~~~~~~
-- Ghost Visual Recon (MP5) — sampled-frame visual DNA for competitor videos.
--
-- Rather than running ffmpeg on the Edge (infeasible in Vercel Edge runtime
-- without filesystem or spawn), we sample key frames from YouTube's
-- thumbnail ladder (hq1..hq3 + 0..3.jpg + sd/mq defaults = ~12 evenly-
-- spaced moments per video), caption each with multimodal Flash, embed
-- the captions with text-embedding-3-small (same model used for MP3
-- Interrogate), and persist per (user_id, video_id). Text query -> embed
-- -> cosine similarity over caption vectors returns the top-K moments
-- with thumbnails and timestamps.
--
-- This is BLACK-OPS tier (Pro+ sub-flag). Limits: pro=2 videos/day,
-- black_ops=20 videos/day (rolling-24h, enforced via the existing
-- 'recon' ghost_action on the MP2 ledger).

create extension if not exists vector schema public;

create table if not exists public.ghost_recon_frames (
  user_id       uuid not null references auth.users(id) on delete cascade,
  video_id      text not null,
  frame_idx     int  not null check (frame_idx between 0 and 31),
  ts_seconds    int  not null,
  thumb_url     text not null,
  caption       text not null,
  visual_tags   text[] not null default '{}',
  embedding     vector(1536),
  model         text,
  created_at    timestamptz not null default now(),
  primary key (user_id, video_id, frame_idx)
);

alter table public.ghost_recon_frames enable row level security;

drop policy if exists ghost_recon_frames_self_all on public.ghost_recon_frames;
create policy ghost_recon_frames_self_all on public.ghost_recon_frames
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.ghost_recon_frames from anon, authenticated;
grant select, insert, update, delete on public.ghost_recon_frames to service_role;
grant select on public.ghost_recon_frames to authenticated;

create index if not exists ghost_recon_frames_user_video_idx
  on public.ghost_recon_frames(user_id, video_id);

create index if not exists ghost_recon_frames_embedding_idx
  on public.ghost_recon_frames
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- ------------------------------
-- RPC: ghost_recon_upsert_frames(user_id, video_id, frames jsonb)
--        Idempotent upsert of a frame batch (caption + embedding + tags).
-- ------------------------------
create or replace function public.ghost_recon_upsert_frames(
  p_user_id   uuid,
  p_video_id  text,
  p_frames    jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn012$
declare
  v_frame jsonb;
  v_ins   int := 0;
begin
  if p_user_id is null or p_video_id is null or p_frames is null then
    return jsonb_build_object('inserted', 0);
  end if;

  for v_frame in select * from jsonb_array_elements(p_frames) loop
    insert into public.ghost_recon_frames
      (user_id, video_id, frame_idx, ts_seconds, thumb_url, caption, visual_tags, embedding, model)
    values (
      p_user_id,
      p_video_id,
      (v_frame->>'frame_idx')::int,
      (v_frame->>'ts_seconds')::int,
      coalesce(v_frame->>'thumb_url', ''),
      coalesce(v_frame->>'caption', ''),
      case
        when jsonb_typeof(v_frame->'visual_tags') = 'array'
          then (select array_agg(x)::text[] from jsonb_array_elements_text(v_frame->'visual_tags') x)
        else '{}'::text[]
      end,
      case
        when v_frame ? 'embedding' and jsonb_array_length(v_frame->'embedding') = 1536
          then (select vector(string_agg((e::text), ','))
                  from jsonb_array_elements_text(v_frame->'embedding') e)
        else null
      end,
      v_frame->>'model'
    )
    on conflict (user_id, video_id, frame_idx) do update
      set caption     = excluded.caption,
          visual_tags = excluded.visual_tags,
          embedding   = coalesce(excluded.embedding, public.ghost_recon_frames.embedding),
          thumb_url   = excluded.thumb_url,
          model       = excluded.model;
    v_ins := v_ins + 1;
  end loop;

  return jsonb_build_object('inserted', v_ins, 'video_id', p_video_id);
end;
$fn012$;

-- ------------------------------
-- RPC: ghost_recon_search(user_id, video_id, embedding, k) -> top-K frames.
-- ------------------------------
create or replace function public.ghost_recon_search(
  p_user_id   uuid,
  p_video_id  text,
  p_embedding jsonb,
  p_k         int default 6
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn013$
declare
  v_query vector(1536);
  v_k     int := greatest(1, least(coalesce(p_k, 6), 12));
  v_out   jsonb;
begin
  if p_user_id is null or p_video_id is null or p_embedding is null then
    return '[]'::jsonb;
  end if;

  select vector(string_agg((e::text), ','))
    into v_query
    from jsonb_array_elements_text(p_embedding) e;

  if v_query is null then return '[]'::jsonb; end if;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    into v_out
    from (
      select f.frame_idx, f.ts_seconds, f.thumb_url, f.caption, f.visual_tags,
             1 - (f.embedding <=> v_query) as similarity
        from public.ghost_recon_frames f
       where f.user_id = p_user_id
         and f.video_id = p_video_id
         and f.embedding is not null
       order by f.embedding <=> v_query
       limit v_k
    ) t;
  return v_out;
end;
$fn013$;

-- ------------------------------
-- RPC: ghost_recon_count(user_id, video_id) -> {count, ready}
-- ------------------------------
create or replace function public.ghost_recon_count(p_user_id uuid, p_video_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn014$
declare
  v_total    int := 0;
  v_with_emb int := 0;
begin
  select count(*), count(embedding)
    into v_total, v_with_emb
    from public.ghost_recon_frames
   where user_id = p_user_id
     and video_id = p_video_id;
  return jsonb_build_object(
    'count', v_total,
    'ready', (v_with_emb > 0)
  );
end;
$fn014$;

revoke all on function public.ghost_recon_upsert_frames(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.ghost_recon_search(uuid, text, jsonb, int) from public, anon, authenticated;
revoke all on function public.ghost_recon_count(uuid, text) from public, anon, authenticated;

grant execute on function public.ghost_recon_upsert_frames(uuid, text, jsonb) to service_role;
grant execute on function public.ghost_recon_search(uuid, text, jsonb, int) to service_role;
grant execute on function public.ghost_recon_count(uuid, text) to service_role, authenticated;

-- ~~~~~~~~~~~~~~~~ END 202608140004_ghost_visual_recon.sql ~~~~~~~~~~~~~~~~

-- ~~~~~~~~~~~~~~~~ BEGIN 202608140005_ghost_dawn_patrol.sql ~~~~~~~~~~~~~~~~
-- Ghost Dawn Patrol (MP6) — always-on daily intel briefings.
--
-- Delivers a concise sunrise brief to Pro+ creators: headline, 3-bullet
-- competitive intel, and a delta vs yesterday's conveyor. Briefs land
-- in the `ghost_dawn_patrol_briefs` table and are surfaced by the
-- in-app DawnPatrolCard (Dashboard) plus an unread-count toast ping.
-- An email channel is reserved for the future (Resend/SES hook in
-- api/_dawnPatrol.ts is a no-op until an EMAIL_PROVIDER_API_KEY env
-- var is set — keeps delivery strictly server-authoritative without
-- shipping an email we cannot send yet).
--
-- pg_cron is scheduled hourly (UTC) and dispatches via pg_net to the
-- Vercel Edge webhook `/api/ghost/dawn-patrol-cron`, which iterates
-- due users and generates a brief per-user (1 credit burned. fails
-- closed against the MP2 ledger like every other ghost action).

-- ------------------------------
-- 0. Extend referral_profiles with dawn-patrol preferences.
-- ------------------------------
alter table public.referral_profiles
  add column if not exists dawn_patrol_enabled boolean not null default true,
  add column if not exists dawn_patrol_send_hour int not null default 7
    check (dawn_patrol_send_hour between 0 and 23);

-- ------------------------------
-- 1. Briefs table: one row per (user, day in UTC).
-- ------------------------------
create table if not exists public.ghost_dawn_patrol_briefs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  brief_date      date not null default (now() at time zone 'utc')::date,
  headline        text not null,
  bullets         jsonb not null default '[]'::jsonb,   -- json array of strings
  opportunities   jsonb not null default '[]'::jsonb,
  threats         jsonb not null default '[]'::jsonb,
  competitor_delta jsonb not null default '{}'::jsonb,  -- {entered:[], dropped:[], velocity_changes:[]}
  niche_snapshot  text,
  credit_snapshot jsonb not null default '{}'::jsonb,
  delivery_channel text not null default 'in_app',     -- 'in_app' | 'email' | 'both'
  email_status    text,                                -- 'skipped' | 'sent' | 'failed' | null
  model           text,
  read_at         timestamptz,
  created_at      timestamptz not null default now(),
  constraint ghost_dawn_patrol_briefs_user_day_unique unique (user_id, brief_date)
);

alter table public.ghost_dawn_patrol_briefs enable row level security;

drop policy if exists ghost_dawn_patrol_briefs_self_all on public.ghost_dawn_patrol_briefs;
create policy ghost_dawn_patrol_briefs_self_all on public.ghost_dawn_patrol_briefs
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.ghost_dawn_patrol_briefs from anon, authenticated;
grant select on public.ghost_dawn_patrol_briefs to authenticated;
grant select, insert, update, delete on public.ghost_dawn_patrol_briefs to service_role;

create index if not exists ghost_dawn_patrol_briefs_user_date_idx
  on public.ghost_dawn_patrol_briefs(user_id, brief_date desc);

-- ------------------------------
-- 2. RPC: upsert a brief (service_role only — called from the Edge engine).
-- ------------------------------
create or replace function public.ghost_dawn_patrol_upsert(
  p_user_id          uuid,
  p_headline         text,
  p_bullets          jsonb,
  p_opportunities    jsonb,
  p_threats          jsonb,
  p_competitor_delta jsonb,
  p_niche_snapshot   text,
  p_credit_snapshot  jsonb,
  p_delivery_channel text,
  p_email_status     text,
  p_model            text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn015$
declare
  v_id uuid;
begin
  if p_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_user');
  end if;

  insert into public.ghost_dawn_patrol_briefs
    (user_id, brief_date, headline, bullets, opportunities, threats,
     competitor_delta, niche_snapshot, credit_snapshot,
     delivery_channel, email_status, model)
  values
    (p_user_id,
     (now() at time zone 'utc')::date,
     coalesce(p_headline, 'Dawn brief ready.'),
     case when jsonb_typeof(p_bullets) = 'array' then p_bullets else '[]'::jsonb end,
     case when jsonb_typeof(p_opportunities) = 'array' then p_opportunities else '[]'::jsonb end,
     case when jsonb_typeof(p_threats) = 'array' then p_threats else '[]'::jsonb end,
     coalesce(p_competitor_delta, '{}'::jsonb),
     p_niche_snapshot,
     coalesce(p_credit_snapshot, '{}'::jsonb),
     coalesce(p_delivery_channel, 'in_app'),
     p_email_status,
     p_model)
  on conflict (user_id, brief_date) do update
    set headline = excluded.headline,
        bullets = excluded.bullets,
        opportunities = excluded.opportunities,
        threats = excluded.threats,
        competitor_delta = excluded.competitor_delta,
        niche_snapshot = excluded.niche_snapshot,
        credit_snapshot = excluded.credit_snapshot,
        delivery_channel = excluded.delivery_channel,
        email_status = coalesce(excluded.email_status, public.ghost_dawn_patrol_briefs.email_status),
        model = excluded.model
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$fn015$;

-- ------------------------------
-- 3. RPC: fetch latest N briefs for the caller.
-- ------------------------------
create or replace function public.ghost_dawn_patrol_latest(p_n int default 5)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn016$
declare
  v_uid uuid := auth.uid();
  v_n   int  := greatest(1, least(coalesce(p_n, 5), 30));
  v_out jsonb;
begin
  if v_uid is null then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(row_to_json(t) order by t.brief_date desc), '[]'::jsonb)
    into v_out
    from (
      select id, brief_date, headline, bullets, opportunities, threats,
             competitor_delta, niche_snapshot, credit_snapshot,
             delivery_channel, email_status, model, read_at, created_at
        from public.ghost_dawn_patrol_briefs
       where user_id = v_uid
       order by brief_date desc
       limit v_n
    ) t;
  return v_out;
end;
$fn016$;

-- ------------------------------
-- 4. RPC: mark a brief read.
-- ------------------------------
create or replace function public.ghost_dawn_patrol_mark_read(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn017$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or p_id is null then
    return jsonb_build_object('ok', false);
  end if;
  update public.ghost_dawn_patrol_briefs
     set read_at = coalesce(read_at, now())
   where id = p_id and user_id = v_uid;
  return jsonb_build_object('ok', true);
end;
$fn017$;

-- ------------------------------
-- 5. RPC: config get/set.
-- ------------------------------
create or replace function public.ghost_dawn_patrol_config_get()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn018$
declare
  v_uid uuid := auth.uid();
  v_en  boolean;
  v_hr  int;
begin
  if v_uid is null then return 'null'::jsonb; end if;
  select dawn_patrol_enabled, dawn_patrol_send_hour
    into v_en, v_hr
    from public.referral_profiles
   where user_id = v_uid;
  if not found then
    return jsonb_build_object('enabled', true, 'send_hour', 7);
  end if;
  return jsonb_build_object('enabled', coalesce(v_en, true), 'send_hour', coalesce(v_hr, 7));
end;
$fn018$;

create or replace function public.ghost_dawn_patrol_config_set(p_enabled boolean, p_send_hour int)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn019$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('ok', false); end if;
  insert into public.referral_profiles (user_id, dawn_patrol_enabled, dawn_patrol_send_hour)
  values (v_uid, coalesce(p_enabled, true), greatest(0, least(coalesce(p_send_hour, 7), 23)))
  on conflict (user_id) do update
    set dawn_patrol_enabled = coalesce(excluded.dawn_patrol_enabled, public.referral_profiles.dawn_patrol_enabled),
        dawn_patrol_send_hour = excluded.dawn_patrol_send_hour;
  return jsonb_build_object('ok', true, 'enabled', coalesce(p_enabled, true), 'send_hour', greatest(0, least(coalesce(p_send_hour, 7), 23)));
end;
$fn019$;

-- ------------------------------
-- 6. RPC (cron support): list users due for a brief right now (UTC hour).
--    Used by the cron webhook. service_role only to avoid leaking data.
-- ------------------------------
create or replace function public.ghost_dawn_patrol_due_users(p_utc_hour int)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn020$
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
     and (rp.pro_tier_expires_at is null or rp.pro_tier_expires_at > now())
     and not exists (
       select 1 from public.ghost_dawn_patrol_briefs b
        where b.user_id = rp.user_id
          and b.brief_date = (now() at time zone 'utc')::date
     );
  return v_out;
end;
$fn020$;

-- ------------------------------
-- 7. Permissions.
-- ------------------------------
revoke all on function public.ghost_dawn_patrol_upsert(uuid,text,jsonb,jsonb,jsonb,jsonb,text,jsonb,text,text,text) from public, anon, authenticated;
revoke all on function public.ghost_dawn_patrol_latest(int) from public, anon, authenticated;
revoke all on function public.ghost_dawn_patrol_mark_read(uuid) from public, anon, authenticated;
revoke all on function public.ghost_dawn_patrol_config_get() from public, anon, authenticated;
revoke all on function public.ghost_dawn_patrol_config_set(boolean,int) from public, anon, authenticated;
revoke all on function public.ghost_dawn_patrol_due_users(int) from public, anon, authenticated;

grant execute on function public.ghost_dawn_patrol_upsert(uuid,text,jsonb,jsonb,jsonb,jsonb,text,jsonb,text,text,text) to service_role;
grant execute on function public.ghost_dawn_patrol_latest(int) to authenticated, service_role;
grant execute on function public.ghost_dawn_patrol_mark_read(uuid) to authenticated, service_role;
grant execute on function public.ghost_dawn_patrol_config_get() to authenticated, service_role;
grant execute on function public.ghost_dawn_patrol_config_set(boolean,int) to authenticated, service_role;
grant execute on function public.ghost_dawn_patrol_due_users(int) to service_role;

-- ------------------------------
-- 8. pg_cron hourly dispatch (best-effort. if pg_cron/pg_net extensions are
--    not enabled in a given Supabase project, the client also triggers a
--    "lazy generate" on first Dashboard load for the day so we never lose
--    a brief due to missing extensions).
-- ------------------------------
-- MP7 follow-up fix: the original block nested a <dollar-quote>-quoted cron command
-- inside a <dollar-quote>-quoted DO body. PostgreSQL terminates the outer body at the
-- first inner <dollar-quote>, so this raised a hard syntax error at parse time. A parse
-- error cannot be caught by the EXCEPTION handler below (that only traps
-- runtime errors), so the entire DO block failed and the dispatch job was
-- NEVER scheduled — silently, because the migration otherwise succeeded.
-- Distinct dollar-quote tags (do / cron) keep the nesting unambiguous.
do $fn021$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from pg_extension where extname = 'pg_net') then

    -- Idempotent schedule: drop any previous definition first so re-running
    -- the migration cannot leave a stale duplicate job behind.
    perform cron.unschedule('ghost-dawn-patrol-dispatch')
      where exists (select 1 from cron.job where jobname = 'ghost-dawn-patrol-dispatch');

    -- Hourly at :03 UTC.
    perform cron.schedule(
      'ghost-dawn-patrol-dispatch',
      '3 * * * *',
      $fn001$
        select net.http_post(
          url := current_setting('app.dawn_patrol_webhook_url', true),
          headers := jsonb_build_object(
            'content-type', 'application/json',
            'authorization', 'Bearer ' || coalesce(current_setting('app.dawn_patrol_cron_secret', true), '')
          ),
          body := jsonb_build_object(
            'utc_hour', extract(hour from now() at time zone 'utc')::int
          )
        )
        where coalesce(current_setting('app.dawn_patrol_webhook_url', true), '') <> '';
      $fn001$
    );
  end if;
exception when others then
  -- pg_cron/pg_net unavailable — lazy client dispatch handles it.
  raise notice 'dawn patrol cron scheduling skipped: %', sqlerrm;
end;
$fn021$;

-- ~~~~~~~~~~~~~~~~ END 202608140005_ghost_dawn_patrol.sql ~~~~~~~~~~~~~~~~

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
as $fn022$
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
$fn022$;

create or replace function public.get_ghost_tier()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn023$
begin
  return public.get_ghost_tier_for(auth.uid());
end;
$fn023$;

revoke all on function public.get_ghost_tier() from public, anon;
grant execute on function public.get_ghost_tier() to authenticated, service_role;
revoke all on function public.get_ghost_tier_for(uuid) from public, anon, authenticated;
grant execute on function public.get_ghost_tier_for(uuid) to service_role;

-- ===========================================================================
-- PART 4 — Defect repairs
-- ===========================================================================

-- 4a. The missing niche column read by ghost_dawn_patrol_due_users().
--     Nullable by design. api/_dawnPatrol.ts already coalesces (u?.niche || "").
alter table public.referral_profiles
  add column if not exists niche text;

comment on column public.referral_profiles.niche is
  'Creator niche used by the dawn-patrol briefing. Nullable - readers must coalesce.';

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
as $fn024$
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
$fn024$;

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
as $fn025$
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
$fn025$;

create or replace function public.consume_clone_crush_run()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn026$
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
$fn026$;

revoke all on function public.consume_clone_crush_run() from public, anon, authenticated;
revoke all on function public.get_clone_crush_quota()   from public, anon, authenticated;
grant execute on function public.get_clone_crush_quota()   to authenticated, service_role;
grant execute on function public.consume_clone_crush_run() to service_role;

commit;

-- ===========================================================================
-- PART 5 — VERIFICATION (run separately. all five must pass)
-- ===========================================================================
-- V1. All 10 expected tables present.
--     Expect: 10 rows.
-- select tablename from pg_tables where schemaname='public' order by 1.

-- V2. Entitlement contract intact — the regression guard.
--     Expect: is_pro=f AND tier='free' for any user with NULL expiry.
-- select rp.user_id,
--        public.is_pro(rp.user_id)                              as is_pro,
--        public.get_ghost_tier_for(rp.user_id) ->> 'tier'        as ghost_tier
--   from public.referral_profiles rp
--  where rp.pro_tier_expires_at is null
--  limit 5.

-- V3. Dawn patrol no longer throws on the missing column.
--     Expect: a jsonb array (usually []), NOT an error.
-- select public.ghost_dawn_patrol_due_users(7).

-- V4. Ghost RPCs the API calls now exist.
--     Expect: 3 rows.
-- select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--  where n.nspname='public'
--    and proname in ('get_ghost_quota','consume_ghost_action','register_core_action')
--  order by 1.

-- V5. No RLS policy left with an unwrapped auth.* call.
--     Expect: 0 rows. If non-zero, run SUPABASE_PATCH_RLS_INITPLAN.sql.
-- select tablename, policyname, cmd from pg_policies
--  where schemaname='public'
--    and ((qual ~* 'auth\.(uid|jwt|role)\(\)' and qual !~* 'select\s+auth\.')
--      or (with_check ~* 'auth\.(uid|jwt|role)\(\)' and with_check !~* 'select\s+auth\.')).
