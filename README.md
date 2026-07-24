# 论证树研究工具 · Argument Tree

> 一个让任何人可以结构化推进自己课题的工具。核心不是"AI 帮你想"，而是把你的论证外显化，然后系统性地攻击它。

本仓库实现技术设计方案 **Phase 1（纯离线版本）**，并额外接入 **Supabase Auth + 云端同步**（Phase 2 的一部分，按用户要求提前接入）。

---

## Phase 1 交付判据（已通过端到端验证）

> 用户打开网站 → 走完四步引导 → 进入三栏工作区 → 手动建一棵完整的逻辑树 → 导出 JSON → 刷新页面 → 重新导入 → 树完整还原。

## 已实现

| 项 | 说明 |
|---|---|
| 四步引导流程 | 登录/离线入口 · API 配置（BYOK，只存不用）· 研究类型 · 语言（界面/AI/论文三合一 + 独立检索语言） |
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

在 Supabase 控制台 → **SQL Editor** 执行：

```
supabase/migrations/0001_init.sql
```

该脚本创建 `projects / nodes / evidence / candidates / library_items` 五张表，字段与
`lib/db/schema.ts` 的 TypeScript 类型一一对应，并启用 **RLS**（每个用户只能读写自己的项目）。

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
app/                     Next.js App Router（layout / page / globals.css / icon）
components/
  onboarding/            四步引导
  workspace/             三栏工作区（Header / Left / Center / Right / Maturity）
    tree/                React Flow 树、节点编辑、证据、候选区
  ui/                    共享基元
lib/
  domains/               四套领域配置（对照附录 A）
  db/                    schema 类型 · IndexedDB 存储 · 导入导出 · 迁移
  i18n/                  中英文案
  supabase/              client · sync
  store.ts               zustand 中央状态
  methodology.ts         falsifier 判定 · 成熟度指标
  layout.ts              dagre 自动布局
supabase/migrations/     云端建表 SQL
```
