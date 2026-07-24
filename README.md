# 论证树研究工具 · Argument Tree

> 一个让任何人可以结构化推进自己课题的工具。核心不是"AI 帮你想"，而是把你的论证外显化，然后系统性地攻击它。

本仓库实现技术设计方案 **Phase 1（纯离线版本）** 与 **Phase 2（文献库 · 检索 · 全文 · 分级 · 云端同步）**。

---

## Phase 1 交付判据（已通过端到端验证）

> 用户打开网站 → 走完四步引导 → 进入三栏工作区 → 手动建一棵完整的逻辑树 → 导出 JSON → 刷新页面 → 重新导入 → 树完整还原。

## 已实现

| 项 | 说明 |
|---|---|
| 四步引导流程 | 登录/离线入口 · API 配置（BYOK，多服务商）· 研究类型 · 语言（界面/AI/论文三合一 + 独立检索语言） |
| 三栏工作区 | 左（文献库）· 中（叙述 + 对话框外壳）· 右（逻辑树），响应式折叠 |
| 逻辑树 CRUD | React Flow + dagre：拖拽移动、拖到另一节点上改父子关系、增删改、双击编辑面板 |
| 四套领域配置 | general / physics / experimental / social，节点类型枚举全部由配置驱动 |
| `falsifier` 字段 | 仅对 `empiricalClaim: true` 的节点强制，缺失显示 ⚠；与 `isAssumption` 正交 |
| 证据模型 | `stance: supports / contradicts / ambiguous` 一等对待，反证据红色永远可见 |
| 成熟度诚实指标 | 常驻、不可关闭；只衡量"审查是否发生"，不惩罚诚实标注 |
| 导入导出 JSON | 含 `schema_version` 与链式迁移函数骨架、sha256 校验和 |
| 黑白视觉系统 | 完整 token 层（§7），JetBrains Mono + Inter，五点置信圆 |
| i18n 骨架 | 中英两种界面文案，未翻译语言回落英文 |
| IndexedDB 持久化 | 全部状态本地存储（用 `idb`，非 localStorage） |
| 候选区结构 | AI 产出隔离缓冲的数据结构与 UI 位置已预留（约束四），Phase 3 接 LLM |

## Phase 2 已实现

| 项 | 说明 |
|---|---|
| 文献检索 | OpenAlex + arXiv，经服务端 `/api/search` 并发查询、合并去重、按相关度排序（避开浏览器 CORS） |
| 挂载为证据 | 检索结果 / 库内条目一键挂载到选中节点，选立场（支持/反对/含混），强度由 GRADE 自动建议 |
| PDF 上传 + 全文提取 | 客户端 pdf.js 提取全文与元数据（DOI/年份/标题），拖拽或按钮上传 |
| 归档状态机 | 仅元数据 → 用户上传原文（合并转「有原文」）；`fulltext_status` 永远可见 |
| 本地库关键词检索 | 纯离线可用：对已上传文献的全文做关键词匹配并高亮片段（§1.1 功能边界） |
| GRADE 证据分级 | 按研究设计定基线，小样本/无盲法/无预注册/未重复自动降级（A.3.2） |
| Supabase 云端 | Auth 登录/注册 + 项目 push/pull 同步 + RLS |
| pgvector 语义检索 | 建表 + `match_papers`/`match_library_chunks` RPC + BYOK 嵌入薄转发代理 `/api/embed`（不落盘） |

> 依赖外部网络的部分（OpenAlex/arXiv 检索、pgvector 嵌入）在受限沙箱中被拦截，需在
> Vercel 等开放网络验证；PDF 提取、GRADE、本地库检索为纯客户端，已本地端到端验证。

## Phase 3 地基：多服务商 BYOK 配置

引导第 2 步的 API 配置支持大部分模型与服务商（`lib/providers.ts`）：

| 服务商 | API 形态 | 说明 |
|---|---|---|
| Anthropic (Claude) | anthropic (`/v1/messages`) | 模型 ID 取自官方（Opus 5 / Sonnet 5 / Haiku 4.5 / Fable 5 …） |
| OpenAI | openai (`/chat/completions`) | GPT-5 / GPT-4.1 / o4-mini … |
| DeepSeek | openai 兼容 | `deepseek-v4-pro` / `deepseek-v4-flash`，base `https://api.deepseek.com` |
| OpenRouter | openai 兼容 | 聚合多家，模型形如 `provider/model` |
| 硅基流动 SiliconFlow | openai 兼容 | DeepSeek / Qwen 等 |
| Kimi (Moonshot) | openai 兼容 | `kimi-k2-*` / `moonshot-v1-*`，可编辑 Base URL（.cn / .ai） |
| MiMo（小米） | openai 兼容 | 填入 Base URL + 模型 ID |
| Ollama（本地） | openai 兼容 | 可编辑 Base URL |
| 兼容端点（自定义） | openai 兼容 | 任意 OpenAI 兼容 `/chat/completions` 端点，填 Base URL + 模型 ID |

- 选服务商自动带出 Base URL 与模型下拉；兼容端点/Ollama/Kimi/MiMo 可编辑 Base URL；任何服务商都可手填模型 ID（下拉里选「自定义」）。
- **模型字段旁挂官方文档链接**（「官方文档 ↗」），预设模型过期时可点开核对并手填最新 ID。
- **默认模型**存入配置（发起调用的必需信息）；对话框将在 Phase 3 支持每次临时切换。
- **测试连接**真实发一次最小请求（经服务端 `/api/llm/test` 转发，避开浏览器 CORS）。
- 统一调用封装在 `lib/llm/chat.ts`（`callLLM`），一套接口兼容 anthropic 与 openai 两种形态，
  遵循 §1.1 方案 A（服务端转发、不落盘、不记录 body、key 用完即弃）——这是 Phase 3 五种对话
  调用类型的地基。
- 模型列表为"已知当前值"的种子，可能随各服务商更新变化；每个服务商附官方文档链接供核对。

## Phase 3 已实现：对话核心（§6.5 / §5.2 F / §6.7）

对话框是唯一 AI 入口；所有产出进候选区，不直接改树（约束四）。

| 调用类型 | 说明 |
|---|---|
| 自由对话 | 发消息给已配置的模型（经 `/api/llm/chat` 服务端转发），带节点上下文，遵守 BASE_ROLE |
| ⚔ 红队 | 第 1 步**确定性结构检查**（纯代码，无 LLM：缺 falsifier / 无证据 / 单一假设 / 外推跨度 / 清单缺项 / 识别假设未论证…）+ 第 2 步领域红队序列（LLM）→ 候选区 |
| ⌕ 检索 | 触发左栏 OpenAlex/arXiv 检索（Phase 2） |
| ✦ 发散 | Brainstorm，每条强制附「我为什么可能是错的」→ 候选区 |
| ⇄ 对比 | 抽取他人「假设-方法-结论」三元组与用户节点对齐 → 候选区 |
| ⊕ 建节点 | 把对话结论提炼成节点草案 → 候选区 |
| 候选区判死/采纳 | 采纳：反证据→挂为 `contradicts` 证据；方向/草案→入树为节点。判死→丢弃 |

- Prompt 分层（`lib/prompts.ts`）：BASE_ROLE + 领域方法论 + 输出契约(JSON) + 语言指令（术语/文献标题不翻译）。
- 结构检查（`lib/redteam.ts`）**确定性 100%**——结构性问题由代码检出，不交给会幻觉的模型（§A.5.3）。
- 树工具栏 ⚔ 红队按钮对选中节点直接触发。

**本地验证**：确定性结构检查（检出缺证伪条件/Popper）、无 key 时优雅降级、候选→采纳→入树（约束四端到端）、Phase 1 全链路回归均通过。

> 依赖真实 LLM 调用的部分（自由对话、红队第 2 步、发散、对比、建节点）需在配好 key 的
> Vercel 环境验证；结构检查、候选区判死/采纳为纯客户端，已本地验证。
> 新颖性检索（发散候选自动跑 OpenAlex 查重）、正式论文模式为后续。

## 技术栈

- **Next.js 15** App Router + TypeScript
- **Tailwind CSS** + 自定义 token 层（`app/globals.css` + `tailwind.config.ts`）
- **React Flow (@xyflow/react) + dagre** 树 UI
- **idb** IndexedDB 封装
- **zustand** 状态管理（单一更新函数自动递增 `client_rev`）
- **@supabase/supabase-js** Auth + 云端同步

---

## 本地运行

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # 生产构建
```

Phase 1 纯离线部分**无需任何环境变量**即可运行（不登录，仅本地使用）。

---

## Supabase（云端同步）

### 1. 环境变量

在项目根创建 `.env.local`（已被 `.gitignore` 排除，切勿提交）：

```
NEXT_PUBLIC_SUPABASE_URL="https://<project>.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="<anon key>"
```

> 只有 `NEXT_PUBLIC_` 前缀的变量会暴露到浏览器。`SERVICE_ROLE_KEY` / `POSTGRES_PASSWORD` /
> `JWT_SECRET` 等密钥**绝不加** `NEXT_PUBLIC_` 前缀，也不在客户端使用。

### 2. 建表

在 Supabase 控制台 → **SQL Editor** 依次执行：

```
supabase/migrations/0001_init.sql   # 五张核心表 + RLS
supabase/migrations/0002_pgvector.sql  # pgvector 扩展、papers/library_chunks、match RPC
```

`0001` 创建 `projects / nodes / evidence / candidates / library_items`，字段与
`lib/db/schema.ts` 的 TypeScript 类型一一对应，并启用 **RLS**（每个用户只能读写自己的项目）。
`0002` 启用 pgvector 语义检索基础设施（维度 1536，对应 text-embedding-3-small）。

**嵌入（可选，语义检索用）**：pgvector 检索需要 embedding。采用 BYOK，客户端把
OpenAI key 随请求发给 `/api/embed` 薄转发代理，**服务端不落盘、不记录**（§1.1 方案 A）。
无 key 时自动降级为本地/关键词检索，不影响其他功能。

### 3. 使用

- 引导第 1 步用邮箱/密码登录或注册（走 Supabase Auth）。
- 工作区右上角 ⚙ → **上传到云端 / 从云端拉取**。

> ⚠️ **网络说明**：云端同步需要运行环境允许出站到 `*.supabase.co`。部分受限网络
> （如本项目的 CI 沙箱）会拦截该出站，此时应用仍以纯离线模式正常工作；请在
> Vercel 等开放网络环境部署后验证登录与同步。同步为最小实现（按 id upsert / 整项目拉取），
> `§4.2` 的节点级冲突副本合并留待后续完善。

---

## 部署

连接 GitHub 仓库到 **Vercel** 即自动部署。在 Vercel 项目设置里配置上述环境变量。

---

## 六条不可违背的约束（贯穿实现）

1. **反证据与支持证据完全对等** —— `stance` 是一等字段，反证据红色永远可见、不可折叠。
2. **假设节点视觉醒目** —— 虚线边框 + 全大写类型标签，判据是配置里的 `isAssumption`。
3. **`falsifier` 只对经验节点强制** —— 判据是 `empiricalClaim`，与 `isAssumption`、节点 id 正交。
4. **AI 产出永不自动入树** —— 一律进候选区，由人判死或采纳。
5. **导入导出在 Phase 1** —— 整棵树在客户端可完整重建。
6. **领域差异靠配置，不靠分支** —— 加第五个领域是写一份配置文件。

## 目录结构

```
app/
  api/search/            OpenAlex + arXiv 检索路由（服务端）
  api/embed/             BYOK 嵌入薄转发代理（不落盘）
  layout / page / globals.css / icon
components/
  onboarding/            四步引导
  workspace/             三栏工作区（Header / Left / Center / Right / Maturity）
    tree/                React Flow 树、节点编辑、证据、候选区
  ui/                    共享基元
lib/
  domains/               四套领域配置（对照附录 A）
  db/                    schema 类型 · IndexedDB 存储 · 导入导出 · 迁移
  search/                OpenAlex / arXiv 客户端 · 合并去重 · 本地关键词检索
  i18n/                  中英文案
  supabase/              client · sync
  store.ts               zustand 中央状态
  methodology.ts         falsifier 判定 · 成熟度指标
  grade.ts               GRADE 证据分级（A.3.2）
  pdf.ts                 pdf.js 全文提取 + 分块
  layout.ts              dagre 自动布局
supabase/migrations/     云端建表 SQL（0001 核心 · 0002 pgvector）
```
