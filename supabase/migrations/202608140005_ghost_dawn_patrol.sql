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
-- due users and generates a brief per-user (1 credit burned; fails
-- closed against the MP2 ledger like every other ghost action).

-- ---------------------------------------------------------------------------
-- 0. Extend referral_profiles with dawn-patrol preferences.
-- ---------------------------------------------------------------------------
alter table public.referral_profiles
  add column if not exists dawn_patrol_enabled boolean not null default true,
  add column if not exists dawn_patrol_send_hour int not null default 7
    check (dawn_patrol_send_hour between 0 and 23);

-- ---------------------------------------------------------------------------
-- 1. Briefs table: one row per (user, day in UTC).
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 2. RPC: upsert a brief (service_role only — called from the Edge engine).
-- ---------------------------------------------------------------------------
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
as $$
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
$$;

-- ---------------------------------------------------------------------------
-- 3. RPC: fetch latest N briefs for the caller.
-- ---------------------------------------------------------------------------
create or replace function public.ghost_dawn_patrol_latest(p_n int default 5)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;

-- ---------------------------------------------------------------------------
-- 4. RPC: mark a brief read.
-- ---------------------------------------------------------------------------
create or replace function public.ghost_dawn_patrol_mark_read(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;

-- ---------------------------------------------------------------------------
-- 5. RPC: config get/set.
-- ---------------------------------------------------------------------------
create or replace function public.ghost_dawn_patrol_config_get()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;

create or replace function public.ghost_dawn_patrol_config_set(p_enabled boolean, p_send_hour int)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;

-- ---------------------------------------------------------------------------
-- 6. RPC (cron support): list users due for a brief right now (UTC hour).
--    Used by the cron webhook; service_role only to avoid leaking data.
-- ---------------------------------------------------------------------------
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
     and (rp.pro_tier_expires_at is null or rp.pro_tier_expires_at > now())
     and not exists (
       select 1 from public.ghost_dawn_patrol_briefs b
        where b.user_id = rp.user_id
          and b.brief_date = (now() at time zone 'utc')::date
     );
  return v_out;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Permissions.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 8. pg_cron hourly dispatch (best-effort; if pg_cron/pg_net extensions are
--    not enabled in a given Supabase project, the client also triggers a
--    "lazy generate" on first Dashboard load for the day so we never lose
--    a brief due to missing extensions).
-- ---------------------------------------------------------------------------
-- MP7 follow-up fix: the original block nested a $$-quoted cron command
-- inside a $$-quoted DO body. PostgreSQL terminates the outer body at the
-- first inner $$, so this raised a hard syntax error at parse time. A parse
-- error cannot be caught by the EXCEPTION handler below (that only traps
-- runtime errors), so the entire DO block failed and the dispatch job was
-- NEVER scheduled — silently, because the migration otherwise succeeded.
-- Distinct dollar-quote tags ($do$ / $cron$) keep the nesting unambiguous.
do $do$
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
      $cron$
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
      $cron$
    );
  end if;
exception when others then
  -- pg_cron/pg_net unavailable — lazy client dispatch handles it.
  raise notice 'dawn patrol cron scheduling skipped: %', sqlerrm;
end;
$do$;
