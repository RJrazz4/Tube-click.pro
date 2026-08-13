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
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke all on public.ghost_recon_frames from anon, authenticated;
grant select, insert, update, delete on public.ghost_recon_frames to service_role;
grant select on public.ghost_recon_frames to authenticated;

create index if not exists ghost_recon_frames_user_video_idx
  on public.ghost_recon_frames(user_id, video_id);

create index if not exists ghost_recon_frames_embedding_idx
  on public.ghost_recon_frames
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- ---------------------------------------------------------------------------
-- RPC: ghost_recon_upsert_frames(user_id, video_id, frames jsonb)
--        Idempotent upsert of a frame batch (caption + embedding + tags).
-- ---------------------------------------------------------------------------
create or replace function public.ghost_recon_upsert_frames(
  p_user_id   uuid,
  p_video_id  text,
  p_frames    jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;

-- ---------------------------------------------------------------------------
-- RPC: ghost_recon_search(user_id, video_id, embedding, k) -> top-K frames.
-- ---------------------------------------------------------------------------
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
as $$
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
$$;

-- ---------------------------------------------------------------------------
-- RPC: ghost_recon_count(user_id, video_id) -> {count, ready}
-- ---------------------------------------------------------------------------
create or replace function public.ghost_recon_count(p_user_id uuid, p_video_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;

revoke all on function public.ghost_recon_upsert_frames(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.ghost_recon_search(uuid, text, jsonb, int) from public, anon, authenticated;
revoke all on function public.ghost_recon_count(uuid, text) from public, anon, authenticated;

grant execute on function public.ghost_recon_upsert_frames(uuid, text, jsonb) to service_role;
grant execute on function public.ghost_recon_search(uuid, text, jsonb, int) to service_role;
grant execute on function public.ghost_recon_count(uuid, text) to service_role, authenticated;
