/**
 * Prompt 生成系统 (§6.2)。分层：BASE_ROLE + DOMAIN_METHODOLOGY + OUTPUT_CONTRACT + 语言指令。
 * 之后所有 AI 调用都基于它。红队/发散/对比等任务在此基础上追加任务指令与输出 schema。
 *
 * 语言指令要点（§6.2）：术语和文献标题绝不翻译；引用文献保留原始英文。
 */
import type { Domain } from "./db/schema";
import { getDomain } from "./domains";
import {
  defaultTemplate,
  type PromptKey,
  type PromptTemplate,
} from "./promptTemplates";

/**
 * 生效模板：调用方（组件）传入用户编辑过的模板；不传则用该领域默认模板。
 * 任务指令可被用户改写，但 JSON 输出契约永远由代码追加（见 outputContract）。
 */
function tplOf(domain: Domain, tpl?: Partial<PromptTemplate>): PromptTemplate {
  const base = defaultTemplate(domain);
  if (!tpl) return base;
  const out = { ...base };
  for (const k of Object.keys(tpl) as PromptKey[]) {
    const v = tpl[k];
    if (typeof v === "string" && v.trim()) out[k] = v;
  }
  return out;
}

/** 语言指令（分字段：正文用目标语言，文献标题/引用不翻译）。 */
function languageDirective(lang: string): string {
  const name =
    lang === "en"
      ? "English"
      : lang === "ja"
        ? "日本語"
        : lang.startsWith("zh")
          ? "简体中文"
          : lang;
  return `用${name}回复。专业术语首次出现时保留英文原文并加括号标注。引用文献时保留原始英文标题，绝不翻译。`;
}

/** 组装全局 system prompt（角色 + 领域方法论 + 语言指令；前两段可被用户模板覆盖）。 */
export function composeSystem(
  domain: Domain,
  outputLang: string,
  tpl?: Partial<PromptTemplate>,
): string {
  const t = tplOf(domain, tpl);
  return [t.baseRole, t.methodology, languageDirective(outputLang)]
    .filter(Boolean)
    .join("\n\n");
}

/** 输出契约：要求严格 JSON，只返回 JSON，不要额外文字/代码围栏。 */
function outputContract(schemaDesc: string): string {
  return `严格按以下 JSON 结构输出，只输出 JSON 本身，不要任何解释文字或 \`\`\` 代码围栏：\n${schemaDesc}`;
}

export interface NodeCtx {
  claim: string;
  node_type: string;
  falsifier?: string | null;
  confidence?: number | null;
}

/** 把节点上下文渲染成给模型的文本。 */
export function renderNodeContext(node: NodeCtx, extra?: string): string {
  const lines = [
    `目标节点命题：${node.claim || "（空）"}`,
    `节点类型：${node.node_type}`,
    node.falsifier ? `已有证伪条件：${node.falsifier}` : `证伪条件：无`,
    node.confidence != null ? `置信度：${node.confidence}` : "",
  ].filter(Boolean);
  if (extra) lines.push(extra);
  return lines.join("\n");
}

// —— 任务指令构造器（返回追加到 system 之后的 user 指令） ——

/** ⚔ 红队第 2 步：领域序列（第 1 步结构检查已由确定性代码完成）。 */
export function redTeamPrompt(
  nodeCtx: string,
  structureFindings: string,
  domain: Domain = "general",
  tpl?: Partial<PromptTemplate>,
): string {
  return [
    tplOf(domain, tpl).redTeam,
    ``,
    `第 1 步确定性结构检查结果（不要重复）：`,
    structureFindings || "（无结构性问题）",
    ``,
    nodeCtx,
    outputContract(
      `{"findings":[{"dimension":"攻击维度","issue":"发现的问题或薄弱点","self_critique":"我这条判断为什么可能是错的"}]}`,
    ),
  ].join("\n");
}

/** ✦ 发散：Brainstorm。强制自我攻击（新颖性检索由前端另跑）。 */
export function divergePrompt(
  nodeCtx: string,
  domain: Domain = "general",
  tpl?: Partial<PromptTemplate>,
): string {
  return [
    tplOf(domain, tpl).diverge,
    ``,
    nodeCtx,
    ``,
    outputContract(
      `{"directions":[{"content":"方向描述","self_critique":"这个方向在哪里可能崩/依赖什么未验证的前提"}]}`,
    ),
  ].join("\n");
}

/** ⇄ 对比：抽取他人论文的假设-方法-结论三元组，与用户的树对齐。 */
export function comparePrompt(
  nodeCtx: string,
  othersText: string,
  domain: Domain = "general",
  tpl?: Partial<PromptTemplate>,
): string {
  return [
    tplOf(domain, tpl).compare,
    ``,
    `用户的节点：`,
    nodeCtx,
    ``,
    `对方材料：`,
    othersText || "（用户未提供对方材料，请说明需要材料）",
    ``,
    outputContract(
      `{"their_triple":{"assumption":"","method":"","conclusion":""},"shared":[""],"divergent":[""],"yours_unique":[""],"theirs_unique":[""],"self_critique":""}`,
    ),
  ].join("\n");
}

/** 研读·「什么是…？」：解释用户从原文里选取/粘贴的一段（自由文本输出，非 JSON）。 */
export function explainPassagePrompt(
  paperTitle: string,
  passage: string,
  sectionTitle?: string,
  domain: Domain = "general",
  tpl?: Partial<PromptTemplate>,
): string {
  return [
    `用户正在研读论文《${paperTitle || "未命名"}》${
      sectionTitle ? `（${sectionTitle} 部分）` : ""
    }，选取了下面这段原文。`,
    tplOf(domain, tpl).explain,
    ``,
    `原文：`,
    `"""`,
    passage,
    `"""`,
  ].join("\n");
}

/** 研读·模块概述：为论文各模块分别写一句话概括（左栏概览用，JSON 输出）。 */
export function summarizeSectionsPrompt(
  paperTitle: string,
  sections: { title: string; body: string }[],
  domain: Domain = "general",
  tpl?: Partial<PromptTemplate>,
): string {
  const blocks = sections
    .map((s, i) => `【${i + 1}】${s.title}\n${s.body.slice(0, 700)}`)
    .join("\n\n");
  return [
    `论文：《${paperTitle || "未命名"}》`,
    tplOf(domain, tpl).summarize,
    `i 用模块序号。`,
    ``,
    `各模块原文：`,
    blocks,
    ``,
    outputContract(`{"summaries":[{"i":1,"summary":"该模块的一句话概述"}]}`),
  ].join("\n");
}

/** 研读·「分析」：把本论文与库中其它相关论文做对比分析（自由文本输出，非 JSON）。 */
export function analyzeComparePrompt(
  paperTitle: string,
  paperSummary: string,
  others: { title: string; abstract?: string }[],
  focus?: string,
  domain: Domain = "general",
  tpl?: Partial<PromptTemplate>,
): string {
  const othersText =
    others.length === 0
      ? "（文献库中暂无其它论文可对比）"
      : others
          .map(
            (o, i) =>
              `[${i + 1}] ${o.title}\n摘要：${o.abstract?.trim() || "（无摘要）"}`,
          )
          .join("\n\n");
  return [
    `用户正在研读论文《${paperTitle || "未命名"}》。请围绕${
      focus?.trim() ? `「${focus.trim()}」` : "该论文的核心论点"
    }展开。`,
    tplOf(domain, tpl).analyze,
    ``,
    `本论文：`,
    paperSummary || "（仅有标题）",
    ``,
    `其它论文：`,
    othersText,
  ].join("\n");
}

/** ⊕ 建节点：把对话结论转成节点草案（进候选区待确认）。 */
export function makeNodePrompt(
  conversation: string,
  domain: Domain,
  tpl?: Partial<PromptTemplate>,
): string {
  const d = getDomain(domain);
  const types = d.nodeTypes.map((t) => t.id).join(" | ");
  return [
    tplOf(domain, tpl).makeNode,
    ``,
    conversation,
    ``,
    `node_type 从这些领域类型里选一个：${types}`,
    outputContract(
      `{"claim":"命题","node_type":"类型id","falsifier":"证伪条件（经验命题必填，否则留空）","self_critique":"这条命题可能哪里有问题"}`,
    ),
  ].join("\n");
}
