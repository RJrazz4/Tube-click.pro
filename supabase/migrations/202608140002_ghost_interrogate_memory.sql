-- Ghost Interrogation (chat-with-competitor) — transcript chunk memory.
--
-- Stores chunked+embedded transcript segments per (user_id, video_id) so
-- interrogate chat can do semantic retrieval over the competitor's words.
--
-- Embedding dimension 1536 aligns with text-embedding-3-small /
-- text-embedding-ada-002; we don't hard-pin a provider here — the edge
-- route chooses the cheapest capable embedder and the column type
-- accepts any vector(1536).
--
-- Idempotency: chunks PK is (user_id, video_id, chunk_index); repeated
-- indexing calls are upsert no-ops (ON CONFLICT DO NOTHING).

-- pgvector must be enabled on the project. In Supabase this ships as
-- an extension; the guard "if not exists" makes the migration safe to
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

-- Self-read/insert via SECURITY DEFINER RPCs; direct inserts are not granted.
drop policy if exists ghost_memory_chunks_self_all on public.ghost_memory_chunks;
create policy ghost_memory_chunks_self_all on public.ghost_memory_chunks
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke all on public.ghost_memory_chunks from anon, authenticated;
grant select, insert, update, delete on public.ghost_memory_chunks to service_role;
-- Authenticated may only SELECT via RPC (we also grant select directly for
-- possible future debugging; RLS restricts to self rows).
grant select on public.ghost_memory_chunks to authenticated;

create index if not exists ghost_memory_chunks_user_video_idx
  on public.ghost_memory_chunks(user_id, video_id);

create index if not exists ghost_memory_chunks_embedding_idx
  on public.ghost_memory_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- ---------------------------------------------------------------------------
-- RPC: ghost_index_chunks(user_id, video_id, slot_id, chunks jsonb)
--        Upserts an ordered list of transcript chunks with embeddings.
--        Idempotent — existing (user_id, video_id, chunk_index) rows are
--        left untouched; new rows inserted.
-- ---------------------------------------------------------------------------
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
as $$
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
$$;

-- ---------------------------------------------------------------------------
-- RPC: ghost_search_chunks(user_id, video_id, embedding, k) -> top-k chunks.
--        Returns an ordered list of {chunk_index, text, start_ts, end_ts,
--        meta, similarity} — similarity is 1 - cosine distance.
--        The caller supplies the embedding (computed at the edge); the DB
--        only handles vector similarity on already-indexed chunks.
-- ---------------------------------------------------------------------------
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
$$;

-- ---------------------------------------------------------------------------
-- RPC: ghost_count_chunks(user_id, video_id) -> {count, has_embeddings}.
--        Used by the edge route to decide if indexing can be skipped (cache hit).
-- ---------------------------------------------------------------------------
create or replace function public.ghost_count_chunks(p_user_id uuid, p_video_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;

revoke all on function public.ghost_index_chunks(uuid, text, int, jsonb) from public, anon, authenticated;
revoke all on function public.ghost_search_chunks(uuid, text, jsonb, int) from public, anon, authenticated;
revoke all on function public.ghost_count_chunks(uuid, text) from public, anon, authenticated;

-- Only service_role may call the mutating/vector RPCs; the edge route
-- authenticates the JWT and then calls through the service key.
grant execute on function public.ghost_index_chunks(uuid, text, int, jsonb) to service_role;
grant execute on function public.ghost_search_chunks(uuid, text, jsonb, int) to service_role;
grant execute on function public.ghost_count_chunks(uuid, text) to service_role, authenticated;
