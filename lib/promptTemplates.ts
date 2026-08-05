/**
 * 按课题分类（领域）可编辑的提示词模板。
 *
 * 设计要点：
 *  - 默认模板由领域配置推导（方法论判据 + 红队序列来自 lib/domains，约束六：领域差异靠配置）。
 *  - 用户只编辑「指令文本」；JSON 输出契约由代码追加，不暴露给编辑——
 *    否则用户改坏 schema 会导致候选区解析失败（约束四的产出通道就断了）。
 *  - 存储只存"覆盖值"，未覆盖的字段始终跟随默认模板演进；可逐项或整体还原。
 */
import type { Domain } from "./db/schema";
import { getDomain } from "./domains";

/** 可编辑的提示词字段（对应各 AI 互动入口）。 */
export type PromptKey =
  | "baseRole"
  | "methodology"
  | "redTeam"
  | "diverge"
  | "compare"
  | "makeNode"
  | "explain"
  | "analyze"
  | "summarize";

export type PromptTemplate = Record<PromptKey, string>;

/** 每个领域的覆盖值（只存用户改过的字段）。 */
export type PromptOverrides = Partial<Record<Domain, Partial<PromptTemplate>>>;

/** UI 元信息：分组、标题、说明。 */
export const PROMPT_FIELDS: {
  key: PromptKey;
  label: string;
  hint: string;
  group: "角色" | "对话调用" | "研读";
  rows: number;
}[] = [
  {
    key: "baseRole",
    label: "角色与红线",
    hint: "所有调用共享的底层身份与禁止事项（不编造文献、产出进候选区、必附自我批评）",
    group: "角色",
    rows: 8,
  },
  {
    key: "methodology",
    label: "领域方法论与攻击维度",
    hint: "该课题分类的判据与红队审查维度，默认来自领域配置",
    group: "角色",
    rows: 10,
  },
  {
    key: "redTeam",
    label: "⚔ 红队审查",
    hint: "确定性结构检查之后的领域序列审查指令",
    group: "对话调用",
    rows: 5,
  },
  {
    key: "diverge",
    label: "✦ 发散",
    hint: "提出新方向；最易放大幻觉，故强制每条自我攻击",
    group: "对话调用",
    rows: 4,
  },
  {
    key: "compare",
    label: "⇄ 对比",
    hint: "抽取他人工作的假设-方法-结论三元组并与本树对齐",
    group: "对话调用",
    rows: 4,
  },
  {
    key: "makeNode",
    label: "⊕ 建节点",
    hint: "把对话结论提炼成节点草案（进候选区待确认）",
    group: "对话调用",
    rows: 4,
  },
  {
    key: "explain",
    label: "研读 · 什么是…？",
    hint: "解释用户粘贴的原文段落",
    group: "研读",
    rows: 6,
  },
  {
    key: "analyze",
    label: "研读 · 分析",
    hint: "把本文与库中其它论文做对比分析",
    group: "研读",
    rows: 5,
  },
  {
    key: "summarize",
    label: "研读 · 模块概述",
    hint: "为论文各模块生成一句话概述",
    group: "研读",
    rows: 4,
  },
];

/** 共享红线（默认 baseRole）。 */
const DEFAULT_BASE_ROLE = `你是论证结构分析助手，不是答案提供者。红线：
- 绝不编造文献。任何文献必须来自检索工具的真实返回，附 DOI 或 OpenAlex ID；没有就说没有。
- 你的所有产出都进入"候选区"，由用户判死或采纳，绝不直接修改用户的树。
- 每条建议、每个方向都必须附「我为什么可能是错的」（self_critique）。
- 不确定时明确说不确定，不要补全成看似完整的答案。
- 你分析论证结构（前提、假设、证伪条件、竞争解释），而非替用户下结论。`;

/** 领域方法论层默认值（由领域配置推导）。 */
function defaultMethodology(domain: Domain): string {
  const d = getDomain(domain);
  return [
    `研究领域：${d.label}。方法论判据：${d.methodologyBasis}。`,
    `攻击/审查维度（来自领域共同体，非本工具发明）：`,
    ...d.redTeamSequence.map((s, i) => `${i + 1}. ${s}`),
  ].join("\n");
}

/** 各任务指令的默认文本（与 lib/prompts.ts 的行为一致）。 */
const DEFAULT_TASKS: Omit<PromptTemplate, "baseRole" | "methodology"> = {
  redTeam: `对下列节点执行红队审查（领域序列）。第 1 步的确定性结构检查已完成，结果会一并给出，不要重复。
逐条执行方法论攻击维度，给出对该节点的实质判断（会出错，用户会裁决）。`,
  diverge: `基于下列节点，提出若干新的研究方向/连接点（brainstorm）。你最容易在这里放大幻觉，因此每条必须诚实：每条都要说明它在哪里可能崩、依赖什么未验证的前提。`,
  compare: `这是描述性任务：抽取对方工作的「假设-方法-结论」三元组，并与用户的节点对齐。不需要你有判断力，只需准确归纳。`,
  makeNode: `把下面的对话结论提炼成一个节点草案。命题要具体可检验；若是经验命题，给出证伪条件。`,
  explain: `阅读理解任务：用户正在研读一段原文，请帮他读懂它。要求：
- 用通俗但准确的语言说清这段在讲什么；
- 点出其中的关键术语、假设、方法或结论（术语首次出现保留英文原文）；
- 若这段涉及可证伪的经验命题，指出它的证伪条件是什么；
- 不确定或原文没说清的地方，直接说不确定，绝不编造。`,
  analyze: `对比分析任务：把用户正在研读的论文与文献库中其它相关论文做对比。
客观归纳：共识在哪、分歧在哪（真正的分歧点最有价值）、各自独特的贡献或盲点。
只依据给出的材料；材料不足以判断处，明说不足，不要脑补论文里没有的内容。`,
  summarize: `为用户正在研读的论文逐个模块写「一句话概述」，帮他快速把握论文结构。
每条 ≤ 40 字，说清这个模块在做什么 / 得到了什么。只依据模块原文，不编造；信息不足就概述已有部分。`,
};

/** 某领域的完整默认模板。 */
export function defaultTemplate(domain: Domain): PromptTemplate {
  return {
    baseRole: DEFAULT_BASE_ROLE,
    methodology: defaultMethodology(domain),
    ...DEFAULT_TASKS,
  };
}

/** 叠加用户覆盖后的生效模板。 */
export function resolveTemplate(
  domain: Domain,
  overrides?: PromptOverrides,
): PromptTemplate {
  const base = defaultTemplate(domain);
  const ov = overrides?.[domain];
  if (!ov) return base;
  const out = { ...base };
  for (const k of Object.keys(ov) as PromptKey[]) {
    const v = ov[k];
    if (typeof v === "string" && v.trim()) out[k] = v;
  }
  return out;
}

/** 该字段是否已被用户改过（UI 显示「已自定义」并允许还原）。 */
export function isCustomized(
  domain: Domain,
  key: PromptKey,
  overrides?: PromptOverrides,
): boolean {
  const v = overrides?.[domain]?.[key];
  return typeof v === "string" && v.trim() !== "" && v !== defaultTemplate(domain)[key];
}
