-- ============================================================================
-- Phase 2 —— pgvector 语义检索基础设施（§2.1 papers / §6.3.4 library_chunks / §5.1 A）
--
-- 需在执行 0001_init.sql 之后运行。维度 1536 对应 text-embedding-3-small。
-- 公共缓存检索永远走服务端统一模型；用户私有库走用户模型；两路结果在应用层合并，
-- 绝不在向量空间里混合（§2.1 说明）。
-- ============================================================================

create extension if not exists vector;

-- 若 0001 在加入 Phase 2 全文列之前已执行过，这里幂等补齐（§6.3.4）
alter table library_items add column if not exists abstract text;
alter table library_items add column if not exists url text;
alter table library_items add column if not exists oa_pdf_url text;
alter table library_items add column if not exists extracted_text text;
alter table library_items add column if not exists page_count int;
alter table library_items add column if not exists file_hash text;

-- 论文缓存（跨用户共享，仅摘要，降低 API 调用；不加 RLS，§2.3）
create table if not exists papers (
  openalex_id   text primary key,
  doi           text,
  title         text,
  abstract      text,
  authors       jsonb,
  year          int,
  venue         text,
  cited_by      int,
  concepts      jsonb,
  embedding     vector(1536),
  fetched_at    timestamptz default now()
);
create index if not exists papers_embedding_idx
  on papers using hnsw (embedding vector_cosine_ops);

-- 用户上传文献的全文分块（私有，走 RLS）
create table if not exists library_chunks (
  id            uuid primary key,
  item_id       uuid references library_items(id) on delete cascade,
  project_id    uuid references projects(id) on delete cascade,
  chunk_index   int,
  content       text,
  page          int,
  embedding     vector(1536)
);
create index if not exists library_chunks_embedding_idx
  on library_chunks using hnsw (embedding vector_cosine_ops);
create index if not exists library_chunks_project_idx on library_chunks(project_id);

alter table library_chunks enable row level security;
drop policy if exists "own chunks" on library_chunks;
create policy "own chunks" on library_chunks
  for all using (
    project_id in (select id from projects where owner_id = auth.uid())
  ) with check (
    project_id in (select id from projects where owner_id = auth.uid())
  );

-- 公共论文缓存的语义匹配（服务端统一模型）
create or replace function match_papers(
  query_embedding vector(1536),
  match_count int default 10
)
returns table (
  openalex_id text, doi text, title text, abstract text,
  authors jsonb, year int, venue text, cited_by int, similarity float
)
language sql stable as $$
  select p.openalex_id, p.doi, p.title, p.abstract, p.authors, p.year,
         p.venue, p.cited_by,
         1 - (p.embedding <=> query_embedding) as similarity
  from papers p
  where p.embedding is not null
  order by p.embedding <=> query_embedding
  limit match_count;
$$;

-- 用户私有库的语义匹配（RLS 自动限定当前用户项目）
create or replace function match_library_chunks(
  query_embedding vector(1536),
  p_project_id uuid,
  match_count int default 10
)
returns table (
  id uuid, item_id uuid, chunk_index int, content text, page int, similarity float
)
language sql stable as $$
  select c.id, c.item_id, c.chunk_index, c.content, c.page,
         1 - (c.embedding <=> query_embedding) as similarity
  from library_chunks c
  where c.project_id = p_project_id and c.embedding is not null
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
