/**
 * 数据模型 (§2) —— TypeScript 类型定义。
 *
 * 权威来源是 §2.1 的 SQL。Phase 1 不建 Postgres，把每张表读成一个接口，
 * 存进 IndexedDB 的一个 object store。字段名/类型/枚举值一比一照搬，只有两点不同：
 *   - uuid → crypto.randomUUID() 生成的字符串
 *   - timestamptz → ISO 字符串
 * 先按云端 schema 设计类型，再落到本地存储，Phase 2 接 Supabase 时同步层只需搬运，
 * 不改数据形状。
 */

/** 当前导出/存储的 schema 版本。迁移器写成链式 v1→v2→v3，只向前迁移。 */
export const SCHEMA_VERSION = 1;

export type Domain = "general" | "physics" | "experimental" | "social";

// —— 项目 (projects) ——
export interface Project {
  id: string;
  title: string;
  domain: Domain;
  /** 实验科学的具体设计（RCT/队列/…），决定加载哪份报告规范清单 */
  design?: string;
  schema_version: number;
  created_at: string;
  updated_at: string;
}

// —— 节点状态 ——
// open | supported | challenged | dead —— 加上 §4.2 冲突副本的 conflict_copy
export type NodeStatus =
  | "open"
  | "supported"
  | "challenged"
  | "dead"
  | "conflict_copy";

// A.1.1 证伪状态
export type FalsifierStatus =
  | "not_applicable" // 非经验节点默认，不计入警告
  | "unspecified" // 经验节点但未填 → ⚠
  | "specified"
  | "tested_survived"
  | "tested_failed";

// A.1.2 Lakatos 研究纲领角色
export type ProgramRole = "hard_core" | "protective_belt" | "novel_prediction";

// A.5.1 方法论标记
export type MethodologyFlag =
  | "no_falsifier"
  | "single_hypothesis"
  | "extrapolation_gap"
  | "unjustified_identification"
  | "low_internal_validity"
  | "degenerating_program"
  | "approximation_out_of_range";

// —— 节点 (nodes) ——
export interface ArgNode {
  id: string;
  project_id: string;
  parent_id: string | null;
  claim: string;
  /** 领域配置决定可选值，不硬编码 */
  node_type: string;
  /** 0..1，允许直接编辑（A.1.4）。五点圆展示。 */
  confidence: number | null;
  status: NodeStatus;
  /** 领域扩展槽：物理存 {validity_range,...}，社科存 {internal_validity,...} */
  domain_fields: Record<string, unknown>;
  /** React Flow 手动布局坐标，必须持久化，刷新不丢 */
  position: { x: number; y: number } | null;
  order_index: number;

  // —— A.5.1 方法论层字段 ——
  /** 什么结果会推翻它。empiricalClaim 节点强制。 */
  falsifier: string | null;
  falsifier_status: FalsifierStatus;
  program_role: ProgramRole | null;
  methodology_flags: MethodologyFlag[];

  created_at: string;
  updated_at: string;
  /** 离线冲突检测用。每次内容写入 +1，由客户端在唯一更新函数里自动递增（§2.2）。 */
  client_rev: number;
}

// —— 证据 (evidence) ——
export type EvidenceSourceType =
  | "paper"
  | "dataset"
  | "user_reasoning"
  | "external_link";
/** 反证据与支持证据完全对等（约束一）。这是整个设计里最重要的字段。 */
export type EvidenceStance = "supports" | "contradicts" | "ambiguous";

export interface Evidence {
  id: string;
  node_id: string;
  project_id: string; // 反范式，为 RLS/查询提速
  source_type: EvidenceSourceType;
  stance: EvidenceStance;
  strength: number | null; // 1..5，用户评定
  doi?: string;
  openalex_id?: string;
  url?: string;
  title?: string;
  authors?: string[];
  year?: number;
  excerpt?: string; // 用户摘录，非全文
  note?: string; // 用户自己的判断
  created_at: string;
}

// —— 候选区 (candidates) —— AI 产出的隔离缓冲。Phase 1 只预留结构，不生成。
export type CandidateKind =
  | "direction"
  | "connection"
  | "counter_evidence"
  | "route_diff";
export type CandidateVerdict = "pending" | "accepted" | "rejected";

export interface Candidate {
  id: string;
  project_id: string;
  target_node_id: string | null;
  kind: CandidateKind;
  content: Record<string, unknown>;
  novelty_check?: {
    similar_papers: unknown[];
    verdict: "novel" | "likely_done" | "unclear";
  };
  self_critique: string; // 强制字段：这条为什么可能是错的
  verdict: CandidateVerdict;
  created_at: string;
}

// —— 文献库条目 (library_items) —— Phase 1 只做本地手动添加（左栏 UI 外壳） ——
export type FulltextStatus =
  | "metadata_only"
  | "fulltext_available"
  | "user_uploaded"
  | "unavailable";

export interface LibraryItem {
  id: string;
  project_id: string;
  openalex_id?: string;
  doi?: string;
  arxiv_id?: string;
  pmid?: string;
  title: string;
  authors?: string[];
  year?: number;
  venue?: string;
  cited_by?: number;
  fulltext_status: FulltextStatus;
  fulltext_source?: string;
  read_status: "unread" | "reading" | "read";
  user_note?: string;
  tags?: string[];
  added_at: string;

  // —— Phase 2 全文/检索字段（§6.3.4）——
  abstract?: string;
  url?: string;
  oa_pdf_url?: string;
  /** 客户端 pdf.js 提取的全文（离线关键词检索的数据源） */
  extracted_text?: string;
  page_count?: number;
  file_hash?: string;
}

/**
 * API 配置（BYOK）。Phase 3 接 LLM 调用时使用；多服务商兼容（见 lib/providers.ts）。
 * provider 为服务商预设 id（anthropic/openai/deepseek/openrouter/siliconflow/ollama/compatible）。
 */
export interface ApiConfig {
  /** 服务商预设 id；null 表示未配置 */
  provider: string | null;
  apiKey: string;
  /** 覆盖 base URL（兼容端点/自建代理/Ollama）；空则用预设默认 */
  baseUrl?: string;
  /** 选定的模型 ID（默认调用用；对话框可临时切换） */
  model?: string;
  /** 仅本设备浏览器 | 加密同步 */
  storage: "local" | "encrypted_sync";
  tested: boolean;
}

/** 语言配置 —— 界面/AI/论文三合一 + 独立检索语言（§6.1 步骤 4）。 */
export interface LanguageConfig {
  /** 界面 + AI 输出 + 论文草稿共用 */
  ui: string;
  /** 检索语言，独立字段。中文界面 + 英文检索最常见，不绑死。 */
  search: string;
}
