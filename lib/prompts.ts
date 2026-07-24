/**
 * Prompt 生成系统 (§6.2)。分层：BASE_ROLE + DOMAIN_METHODOLOGY + OUTPUT_CONTRACT + 语言指令。
 * 之后所有 AI 调用都基于它。红队/发散/对比等任务在此基础上追加任务指令与输出 schema。
 *
 * 语言指令要点（§6.2）：术语和文献标题绝不翻译；引用文献保留原始英文。
 */
import type { Domain } from "./db/schema";
import { getDomain } from "./domains";

const BASE_ROLE = `你是论证结构分析助手，不是答案提供者。红线：
- 绝不编造文献。任何文献必须来自检索工具的真实返回，附 DOI 或 OpenAlex ID；没有就说没有。
- 你的所有产出都进入"候选区"，由用户判死或采纳，绝不直接修改用户的树。
- 每条建议、每个方向都必须附「我为什么可能是错的」（self_critique）。
- 不确定时明确说不确定，不要补全成看似完整的答案。
- 你分析论证结构（前提、假设、证伪条件、竞争解释），而非替用户下结论。`;

/** 领域方法论层（随研究类型加载，§6.2）。 */
function domainMethodology(domain: Domain): string {
  const d = getDomain(domain);
  return [
    `研究领域：${d.label}。方法论判据：${d.methodologyBasis}。`,
    `攻击/审查维度（来自领域共同体，非本工具发明）：`,
    ...d.redTeamSequence.map((s, i) => `${i + 1}. ${s}`),
  ].join("\n");
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

/** 组装全局 system prompt。 */
export function composeSystem(domain: Domain, outputLang: string): string {
  return [BASE_ROLE, domainMethodology(domain), languageDirective(outputLang)]
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
export function redTeamPrompt(nodeCtx: string, structureFindings: string): string {
  return [
    `对下列节点执行红队审查（领域序列）。第 1 步的确定性结构检查已完成，结果如下，不要重复：`,
    structureFindings || "（无结构性问题）",
    ``,
    nodeCtx,
    ``,
    `逐条执行方法论攻击维度，给出对该节点的实质判断（会出错，用户会裁决）。`,
    outputContract(
      `{"findings":[{"dimension":"攻击维度","issue":"发现的问题或薄弱点","self_critique":"我这条判断为什么可能是错的"}]}`,
    ),
  ].join("\n");
}

/** ✦ 发散：Brainstorm。强制自我攻击（新颖性检索由前端另跑）。 */
export function divergePrompt(nodeCtx: string): string {
  return [
    `基于下列节点，提出若干新的研究方向/连接点（brainstorm）。你最容易在这里放大幻觉，因此每条必须诚实。`,
    ``,
    nodeCtx,
    ``,
    outputContract(
      `{"directions":[{"content":"方向描述","self_critique":"这个方向在哪里可能崩/依赖什么未验证的前提"}]}`,
    ),
  ].join("\n");
}

/** ⇄ 对比：抽取他人论文的假设-方法-结论三元组，与用户的树对齐。 */
export function comparePrompt(nodeCtx: string, othersText: string): string {
  return [
    `这是描述性任务：抽取对方工作的「假设-方法-结论」三元组，并与用户的节点对齐。不需要你有判断力，只需准确归纳。`,
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
): string {
  return [
    `阅读理解任务：用户正在研读论文《${paperTitle || "未命名"}》${
      sectionTitle ? `（${sectionTitle} 部分）` : ""
    }，选取了下面这段原文，请帮他读懂它。要求：`,
    `- 用通俗但准确的语言说清这段在讲什么；`,
    `- 点出其中的关键术语、假设、方法或结论（术语首次出现保留英文原文）；`,
    `- 若这段涉及可证伪的经验命题，指出它的证伪条件是什么；`,
    `- 不确定或原文没说清的地方，直接说不确定，绝不编造。`,
    ``,
    `原文：`,
    `"""`,
    passage,
    `"""`,
  ].join("\n");
}

/** 研读·「分析」：把本论文与库中其它相关论文做对比分析（自由文本输出，非 JSON）。 */
export function analyzeComparePrompt(
  paperTitle: string,
  paperSummary: string,
  others: { title: string; abstract?: string }[],
  focus?: string,
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
    `对比分析任务：用户正在研读论文《${paperTitle || "未命名"}》。请围绕${
      focus?.trim() ? `「${focus.trim()}」` : "该论文的核心论点"
    }，把它与文献库中其它相关论文做对比。`,
    `客观归纳：共识在哪、分歧在哪（真正的分歧点最有价值）、各自独特的贡献或盲点。`,
    `只依据给出的材料；材料不足以判断处，明说不足，不要脑补论文里没有的内容。`,
    ``,
    `本论文：`,
    paperSummary || "（仅有标题）",
    ``,
    `其它论文：`,
    othersText,
  ].join("\n");
}

/** ⊕ 建节点：把对话结论转成节点草案（进候选区待确认）。 */
export function makeNodePrompt(conversation: string, domain: Domain): string {
  const d = getDomain(domain);
  const types = d.nodeTypes.map((t) => t.id).join(" | ");
  return [
    `把下面的对话结论提炼成一个节点草案。`,
    ``,
    conversation,
    ``,
    `node_type 从这些领域类型里选一个：${types}`,
    outputContract(
      `{"claim":"命题","node_type":"类型id","falsifier":"证伪条件（经验命题必填，否则留空）","self_critique":"这条命题可能哪里有问题"}`,
    ),
  ].join("\n");
}
