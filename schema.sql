
-- Ative a extensão de vetores (se ainda não estiver ativa)
create extension if not exists vector;

-- Tabela principal de chunks de lore
create table if not exists public.lore_chunks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  source text not null,
  source_type text not null,
  title text not null,
  content text not null,
  embedding vector(1536)
);

-- Função de busca vetorial
create or replace function public.match_lore_chunks(
  query_embedding vector(1536),
  match_count int,
  similarity_threshold float
)
returns table (
  id uuid,
  source text,
  source_type text,
  title text,
  content text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    lc.id,
    lc.source,
    lc.source_type,
    lc.title,
    lc.content,
    1 - (lc.embedding <=> query_embedding) as similarity
  from public.lore_chunks as lc
  where lc.embedding is not null
    and 1 - (lc.embedding <=> query_embedding) > similarity_threshold
  order by lc.embedding <=> query_embedding
  limit match_count;
end;
$$;

alter function public.match_lore_chunks(vector, int, float) set search_path = public;

