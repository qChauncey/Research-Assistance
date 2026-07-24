-- ============================================================================
-- 论证树研究工具 —— Supabase 初始化 schema（Phase 2 云端）
--
-- 本文件对应技术文档 §2.1 / §6.3.4 / A.5.1，字段与 lib/db/schema.ts 的 TypeScript
-- 类型一一对应（uuid ↔ crypto.randomUUID() 字符串；timestamptz ↔ ISO 字符串）。
--
-- 用法：Supabase 控制台 → SQL Editor → 粘贴执行。执行后云端同步（lib/supabase/sync.ts）
-- 才有落点。未执行时，应用仍以纯离线模式（IndexedDB）正常工作。
-- ============================================================================

-- 项目 --------------------------------------------------------------------
create table if not exists projects (
  id            uuid primary key,
  owner_id      uuid references auth.users(id) on delete cascade,
  title         text not null,
  domain        text not null default 'general',   -- general|physics|experimental|social
  design        text,
  schema_version int not null default 1,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- 节点（论点）-------------------------------------------------------------
create table if not exists nodes (
  id            uuid primary key,
  project_id    uuid references projects(id) on delete cascade,
  parent_id     uuid references nodes(id) on delete cascade,
  claim         text not null default '',
  node_type     text not null,                     -- 领域配置决定可选值
  confidence    real check (confidence >= 0 and confidence <= 1),
  status        text not null default 'open',       -- open|supported|challenged|dead|conflict_copy
  domain_fields jsonb default '{}',
  position      jsonb,                              -- {x,y} React Flow 手动布局
  order_index   int default 0,

  -- A.5.1 方法论层字段
  falsifier         text,
  falsifier_status  text default 'not_applicable',  -- not_applicable|unspecified|specified|tested_survived|tested_failed
  program_role      text,                           -- hard_core|protective_belt|novel_prediction
  methodology_flags jsonb default '[]',

  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  client_rev    bigint default 0                    -- 离线冲突检测：每次内容写入 +1
);
create index if not exists nodes_project_idx on nodes(project_id);
create index if not exists nodes_parent_idx on nodes(parent_id);

-- 证据 --------------------------------------------------------------------
create table if not exists evidence (
  id            uuid primary key,
  node_id       uuid references nodes(id) on delete cascade,
  project_id    uuid references projects(id) on delete cascade,  -- 反范式，为 RLS 提速
  source_type   text not null,                     -- paper|dataset|user_reasoning|external_link
  stance        text not null,                     -- supports|contradicts|ambiguous （一等字段，约束一）
  strength      int check (strength between 1 and 5),
  doi           text,
  openalex_id   text,
  url           text,
  title         text,
  authors       text[],
  year          int,
  excerpt       text,
  note          text,
  created_at    timestamptz default now()
);
create index if not exists evidence_project_idx on evidence(project_id);
create index if not exists evidence_node_idx on evidence(node_id);

-- 候选区（AI 产出的隔离缓冲，约束四）-------------------------------------
create table if not exists candidates (
  id             uuid primary key,
  project_id     uuid references projects(id) on delete cascade,
  target_node_id uuid references nodes(id) on delete set null,
  kind           text not null,                    -- direction|connection|counter_evidence|route_diff
  content        jsonb not null,
  novelty_check  jsonb,
  self_critique  text not null default '',          -- 强制字段：这条为什么可能是错的
  verdict        text default 'pending',            -- pending|accepted|rejected
  created_at     timestamptz default now()
);
create index if not exists candidates_project_idx on candidates(project_id);

-- 文献库条目（§6.3.4）----------------------------------------------------
create table if not exists library_items (
  id            uuid primary key,
  project_id    uuid references projects(id) on delete cascade,
  openalex_id   text,
  doi           text,
  arxiv_id      text,
  pmid          text,
  title         text not null,
  authors       jsonb,
  year          int,
  venue         text,
  cited_by      int,
  fulltext_status text not null default 'metadata_only',  -- metadata_only|fulltext_available|user_uploaded|unavailable
  fulltext_source text,
  read_status   text default 'unread',              -- unread|reading|read
  user_note     text,
  tags          text[],
  added_at      timestamptz default now(),

  -- Phase 2 全文/检索字段（§6.3.4）
  abstract      text,
  url           text,
  oa_pdf_url    text,
  extracted_text text,
  page_count    int,
  file_hash     text
);
create index if not exists library_project_idx on library_items(project_id);

-- ============================================================================
-- RLS（§2.3）—— 多用户 + 离线导入，权限漏一个就是别人的课题泄露。
-- ============================================================================
alter table projects      enable row level security;
alter table nodes         enable row level security;
alter table evidence      enable row level security;
alter table candidates    enable row level security;
alter table library_items enable row level security;

drop policy if exists "own projects" on projects;
create policy "own projects" on projects
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "own nodes" on nodes;
create policy "own nodes" on nodes
  for all using (
    project_id in (select id from projects where owner_id = auth.uid())
  ) with check (
    project_id in (select id from projects where owner_id = auth.uid())
  );

drop policy if exists "own evidence" on evidence;
create policy "own evidence" on evidence
  for all using (
    project_id in (select id from projects where owner_id = auth.uid())
  ) with check (
    project_id in (select id from projects where owner_id = auth.uid())
  );

drop policy if exists "own candidates" on candidates;
create policy "own candidates" on candidates
  for all using (
    project_id in (select id from projects where owner_id = auth.uid())
  ) with check (
    project_id in (select id from projects where owner_id = auth.uid())
  );

drop policy if exists "own library" on library_items;
create policy "own library" on library_items
  for all using (
    project_id in (select id from projects where owner_id = auth.uid())
  ) with check (
    project_id in (select id from projects where owner_id = auth.uid())
  );
