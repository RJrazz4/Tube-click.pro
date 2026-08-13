-- Ghost Intel Squad — multi-agent competitor dossier persistence.
--
-- One row per (user, slot, video) holds the full JSON dossier produced
-- by the Scout/Crawler/Analyst/Comparator agent chain. Idempotent
-- upsert on (user_id, video_id) so repeat clicks hit the cached brief
-- without re-burning a squad credit; the edge route performs a
-- slot-scoped lookup before consuming a credit.
--
-- Security model matches the ghost_memory_chunks table from MP3:
--   - RLS: self read/delete via authenticated; service_role full.
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

-- ---------------------------------------------------------------------------
-- RPC: ghost_upsert_squad_brief(user_id, slot_id, target_video_id, payload,
--        model, cost_tokens, threat_level)
--        Idempotent upsert. Returns the stored row's id + created_at.
-- ---------------------------------------------------------------------------
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
as $$
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
$$;

-- ---------------------------------------------------------------------------
-- RPC: ghost_get_squad_brief(user_id, target_video_id) -> payload jsonb or null.
--        Service-role only; edge route validates JWT first.
-- ---------------------------------------------------------------------------
create or replace function public.ghost_get_squad_brief(
  p_user_id        uuid,
  p_target_video_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;

revoke all on function public.ghost_upsert_squad_brief(uuid, int, text, jsonb, text, int, int) from public, anon, authenticated;
revoke all on function public.ghost_get_squad_brief(uuid, text) from public, anon, authenticated;

grant execute on function public.ghost_upsert_squad_brief(uuid, int, text, jsonb, text, int, int) to service_role;
grant execute on function public.ghost_get_squad_brief(uuid, text) to service_role;
