/**
 * 正式论文模式（Phase 4, §6.4.2）。按研究类型套论文骨架，从树自动填充。
 *
 * 映射规则（§6.4.2）关键点：
 *  - 反证据(contradicts) → 强制进 Limitations 章节（默认值方向决定行为，删除需主动操作）
 *  - 未填 falsifier 的经验节点 → 草稿中标黄「此处缺可证伪条件」
 *  - falsifier 字段 → 可检验预测章节
 * 快照式生成，非双向同步（§6.4.3）。导出 Markdown / LaTeX(含 BibTeX)。
 */
import type { ArgNode, Evidence, Domain, Project } from "./db/schema";
import { getDomain } from "./domains";
import { isEmpirical, isAssumption } from "./methodology";

export interface PaperSection {
  heading: string;
  /** Markdown 正文 */
  body: string;
}

export interface Paper {
  title: string;
  domain: Domain;
  sections: PaperSection[];
  /** 草稿中的黄标警告（缺可证伪条件等） */
  warnings: string[];
}

const WARN = "⚠【此处缺可证伪条件】";

/** 各领域论文骨架（章节顺序，§6.4.2）。 */
const SKELETONS: Record<Domain, string[]> = {
  general: ["Introduction", "Background", "Argument", "Evidence", "Limitations", "Conclusion"],
  physics: ["Introduction", "Formalism", "Derivation", "Limiting Cases", "Predictions", "Discussion"],
  experimental: ["Introduction", "Methods", "Results", "Limitations", "Discussion"],
  social: [
    "Introduction",
    "Theory",
    "Identification Strategy",
    "Data & Results",
    "Robustness",
    "Scope & Limitations",
  ],
};

function claimLine(n: ArgNode, domain: Domain): string {
  const missing = isEmpirical(n, domain) && !(n.falsifier && n.falsifier.trim());
  const conf = n.confidence != null ? `（置信度 ${n.confidence}）` : "";
  return `- ${n.claim || "（空命题）"}${conf}${missing ? ` ${WARN}` : ""}`;
}

function byType(nodes: ArgNode[], types: string[]): ArgNode[] {
  return nodes.filter((n) => types.includes(n.node_type));
}

export function buildPaper(
  project: Project,
  nodes: ArgNode[],
  evidence: Evidence[],
  domain: Domain,
): Paper {
  const warnings: string[] = [];
  const root =
    nodes.find((n) => n.parent_id == null) ?? nodes[0] ?? null;
  const assumptions = nodes.filter((n) => isAssumption(n, domain) && n.status !== "dead");
  const hardCore = nodes.filter((n) => n.program_role === "hard_core");
  const derivations = byType(nodes, ["derivation", "mechanism", "formalism", "symmetry_argument"]);
  const scopeNodes = byType(nodes, ["scope_condition", "limiting_case"]);
  const supports = evidence.filter((e) => e.stance === "supports");
  const contradicts = evidence.filter((e) => e.stance === "contradicts");
  const predictions = nodes.filter(
    (n) => isEmpirical(n, domain) && n.falsifier && n.falsifier.trim(),
  );

  // 收集黄标
  for (const n of nodes) {
    if (isEmpirical(n, domain) && !(n.falsifier && n.falsifier.trim())) {
      warnings.push(`节点「${(n.claim || n.id).slice(0, 24)}」缺可证伪条件`);
    }
  }

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  function evLine(e: Evidence): string {
    const node = e.node_id ? nodeById.get(e.node_id) : undefined;
    const cite = e.title ? `「${e.title}」` : e.note ? e.note : "（未命名证据）";
    const meta = [e.authors?.[0], e.year, e.doi ? `DOI ${e.doi}` : ""]
      .filter(Boolean)
      .join(", ");
    const on = node ? `（支撑：${(node.claim || "").slice(0, 20)}）` : "";
    const strength = e.strength ? ` [强度 ${e.strength}/5]` : "";
    return `- ${cite}${meta ? ` — ${meta}` : ""}${strength} ${on}`;
  }

  // —— 章节内容（映射 §6.4.2） ——
  const content: Record<string, string> = {};

  content.Introduction = [
    root ? `**论点陈述**：${root.claim || "（待补充）"}` : "（尚无根节点）",
    "",
    hardCore.length
      ? "**核心主张**：\n" + hardCore.map((n) => claimLine(n, domain)).join("\n")
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const assumptionsBlock = assumptions.length
    ? "**假设与前提**（显式列出）：\n" + assumptions.map((n) => claimLine(n, domain)).join("\n")
    : "（无显式假设）";

  const derivationBlock = derivations.length
    ? derivations.map((n) => claimLine(n, domain)).join("\n")
    : "（无推导/方法节点）";

  content.Background = assumptionsBlock;
  content.Theory = assumptionsBlock;
  content.Formalism = assumptionsBlock;

  content.Argument = derivationBlock;
  content.Derivation = derivationBlock;
  content.Methods = [assumptionsBlock, "", "**方法/推导**：", derivationBlock].join("\n");
  content["Identification Strategy"] = derivationBlock;

  const evidenceBlock = supports.length
    ? "**支持性证据**：\n" + supports.map(evLine).join("\n")
    : "（尚无支持性证据）";
  content.Evidence = evidenceBlock;
  content.Results = evidenceBlock;
  content["Data & Results"] = evidenceBlock;

  // Limitations —— 反证据强制进入（§6.4.2 最重要一条）
  const limitationsBlock = [
    "**反证据 / 局限**（自动纳入，删除需主动操作）：",
    contradicts.length
      ? contradicts.map(evLine).join("\n")
      : "- （尚无反证据。低反证据覆盖通常意味着还没认真找过。）",
    warnings.length ? "\n**缺可证伪条件的节点**：\n" + warnings.map((w) => `- ${w}`).join("\n") : "",
  ]
    .filter(Boolean)
    .join("\n");
  content.Limitations = limitationsBlock;
  content["Scope & Limitations"] = [
    scopeNodes.length ? "**适用边界**：\n" + scopeNodes.map((n) => claimLine(n, domain)).join("\n") : "",
    "",
    limitationsBlock,
  ]
    .filter(Boolean)
    .join("\n");

  const scopeBlock = scopeNodes.length
    ? scopeNodes.map((n) => claimLine(n, domain)).join("\n")
    : "（未声明适用边界）";
  content["Limiting Cases"] = scopeBlock;
  content.Robustness =
    byType(nodes, ["robustness_check", "placebo_test", "consistency_check"])
      .map((n) => claimLine(n, domain))
      .join("\n") || "（无稳健性/安慰剂检验节点）";

  const predictionBlock = predictions.length
    ? "**可检验预测**（来自各节点的证伪条件）：\n" +
      predictions.map((n) => `- ${n.claim ? n.claim.slice(0, 30) + "：" : ""}${n.falsifier}`).join("\n")
    : "（尚无可检验预测——经验节点应填写证伪条件）";
  content.Predictions = predictionBlock;

  content.Discussion = [
    "**讨论**：综合上述论证与证据。",
    predictionBlock,
    "",
    "全绿不代表研究重要——建议把树拿给领域内可能不同意你的人评审。",
  ].join("\n");
  content.Conclusion = root ? `综上，${root.claim || "（结论待补充）"}。` : "（结论待补充）";

  const skeleton = SKELETONS[domain];
  const sections: PaperSection[] = skeleton.map((h) => ({
    heading: h,
    body: content[h] ?? "（本节待填）",
  }));

  return { title: project.title, domain, sections, warnings };
}

// —— 导出 ——

export function paperToMarkdown(paper: Paper): string {
  const lines = [`# ${paper.title}`, ""];
  for (const s of paper.sections) {
    lines.push(`## ${s.heading}`, "", s.body, "");
  }
  return lines.join("\n");
}

/** LaTeX：物理用 revtex4-2，其余用 article（§6.4.2）。 */
export function paperToLatex(paper: Paper, evidence: Evidence[]): string {
  const docclass =
    paper.domain === "physics"
      ? "\\documentclass[reprint,amsmath,amssymb,aps,prd]{revtex4-2}"
      : "\\documentclass[11pt]{article}";
  const esc = (s: string) =>
    s
      .replace(/\\/g, "\\textbackslash{}")
      .replace(/([&%$#_{}])/g, "\\$1")
      .replace(/⚠【此处缺可证伪条件】/g, "\\textbf{[MISSING FALSIFIER]}")
      .replace(/\n- /g, "\n  \\item ")
      .replace(/^- /gm, "  \\item ");
  const bodySections = paper.sections
    .map((s) => {
      const body = s.body.includes("\\item")
        ? `\\begin{itemize}\n${esc(s.body)}\n\\end{itemize}`
        : esc(s.body);
      return `\\section{${esc(s.heading)}}\n${body}`;
    })
    .join("\n\n");
  const hasBib = evidence.some((e) => e.doi || e.title);
  return [
    docclass,
    "\\usepackage[utf8]{inputenc}",
    "\\begin{document}",
    `\\title{${esc(paper.title)}}`,
    "\\maketitle",
    "",
    bodySections,
    "",
    hasBib ? "\\bibliographystyle{plain}\n\\bibliography{refs}" : "",
    "\\end{document}",
  ]
    .filter(Boolean)
    .join("\n");
}

/** 从证据生成 BibTeX。 */
export function evidenceToBibtex(evidence: Evidence[]): string {
  const entries: string[] = [];
  let i = 0;
  for (const e of evidence) {
    if (!e.title && !e.doi) continue;
    i++;
    const key = `ref${i}`;
    const fields = [
      e.title ? `  title = {${e.title}}` : "",
      e.authors?.length ? `  author = {${e.authors.join(" and ")}}` : "",
      e.year ? `  year = {${e.year}}` : "",
      e.doi ? `  doi = {${e.doi}}` : "",
      e.url ? `  url = {${e.url}}` : "",
    ].filter(Boolean);
    entries.push(`@article{${key},\n${fields.join(",\n")}\n}`);
  }
  return entries.join("\n\n");
}
