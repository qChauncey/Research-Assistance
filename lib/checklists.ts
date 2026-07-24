/**
 * 报告规范清单（Phase 4, A.3.1 / A.5.1）。
 *
 * 依托 EQUATOR 协作网的规范：CONSORT 2025（RCT）、PRISMA 2020（系统综述）、
 * ARRIVE 2.0（动物实验）、STROBE（观察性研究）。
 *
 * ⚠ 这里内置的是各规范的**代表性条目子集**（便于导出结构正确的清单骨架），
 * 不是逐字的完整 30 条。正式投稿请以 equator-network.org 的官方最新版为准。
 * 部分条目可由树自动判定完成状态（auto），其余默认「待填」，用户手动核对。
 */
import type { ArgNode } from "./db/schema";

export interface ChecklistItem {
  id: string;
  section: string;
  text: string;
  /** 由树自动判定是否已覆盖；无则默认待填 */
  auto?: (nodes: ArgNode[]) => boolean;
}

export interface ChecklistDef {
  standard: string;
  label: string;
  source: string;
  items: ChecklistItem[];
}

const hasField =
  (key: string, pred?: (v: unknown) => boolean) => (nodes: ArgNode[]) =>
    nodes.some((n) => {
      const v = n.domain_fields?.[key];
      return pred ? pred(v) : v != null && v !== "";
    });

const CONSORT_2025: ChecklistDef = {
  standard: "CONSORT-2025",
  label: "CONSORT 2025（随机对照试验）",
  source: "Hopewell S. et al., BMJ 2025;389:e081123",
  items: [
    { id: "1", section: "标题与摘要", text: "标题标明为随机试验；摘要结构化" },
    { id: "2", section: "引言", text: "科学背景与理由；具体目标或假设" },
    { id: "3", section: "方法·设计", text: "试验设计（如平行、析因），含分配比例" },
    { id: "4", section: "方法·受试者", text: "受试者资格标准；数据采集的场所与地点" },
    { id: "5", section: "方法·干预", text: "各组干预的充分细节以便重复" },
    { id: "6", section: "方法·结局", text: "预先设定的主要与次要结局指标，含测量时间" },
    {
      id: "7",
      section: "方法·样本量",
      text: "如何确定样本量（含功效计算）",
      auto: hasField("n", (v) => typeof v === "number"),
    },
    { id: "8", section: "随机化·序列", text: "随机分配序列的生成方法" },
    {
      id: "9",
      section: "随机化·隐藏",
      text: "分配隐藏机制（随机化方式已声明）",
      auto: hasField("randomization"),
    },
    {
      id: "10",
      section: "盲法",
      text: "分配后对谁设盲（受试者/实施者/评估者）",
      auto: hasField("blinding", (v) => typeof v === "string" && v !== "无"),
    },
    { id: "11", section: "统计方法", text: "比较各组主要与次要结局的统计方法" },
    { id: "12", section: "结果·流程", text: "各阶段受试者流程（CONSORT 流程图）" },
    { id: "13", section: "结果·基线", text: "各组基线人口学与临床特征表" },
    {
      id: "14",
      section: "结果·估计",
      text: "各主要结局的效应量与精度（95% CI）",
      auto: hasField("effect_size"),
    },
    { id: "15", section: "结果·危害", text: "各组所有重要危害或非预期效应" },
    {
      id: "16",
      section: "其他·注册",
      text: "试验注册号与注册库名称",
      auto: hasField("preregistered"),
    },
    { id: "17", section: "其他·方案", text: "何处可获取完整试验方案" },
    { id: "18", section: "其他·资助", text: "资助来源与资助方作用" },
  ],
};

const PRISMA_2020: ChecklistDef = {
  standard: "PRISMA-2020",
  label: "PRISMA 2020（系统综述 / 元分析）",
  source: "Page MJ. et al., BMJ 2021;372:n71",
  items: [
    { id: "1", section: "标题", text: "标明为系统综述" },
    { id: "2", section: "摘要", text: "结构化摘要（PRISMA-A）" },
    { id: "3", section: "引言·理由", text: "在已知背景下说明综述理由" },
    { id: "4", section: "引言·目的", text: "明确目的或研究问题（PICO）" },
    { id: "5", section: "方法·纳排", text: "纳入与排除标准" },
    { id: "6", section: "方法·信息源", text: "所有检索的数据库/来源与最后检索日期" },
    { id: "7", section: "方法·检索式", text: "至少一个数据库的完整检索式" },
    { id: "8", section: "方法·筛选", text: "记录筛选与纳入的流程" },
    { id: "9", section: "方法·数据项", text: "提取的数据项与假设" },
    { id: "10", section: "方法·偏倚", text: "评估单个研究偏倚风险的方法" },
    { id: "11", section: "方法·综合", text: "结果综合/元分析方法（异质性）" },
    { id: "12", section: "结果·流程", text: "检索到/纳入/排除的研究数（PRISMA 流程图）" },
    { id: "13", section: "结果·特征", text: "各纳入研究的特征" },
    { id: "14", section: "结果·偏倚", text: "各研究偏倚风险评估" },
    { id: "15", section: "结果·综合", text: "各项综合结果（含 CI 与异质性）" },
    { id: "16", section: "讨论", text: "证据总体强度、局限性、结论" },
    { id: "17", section: "其他", text: "注册号、方案、资助、利益冲突" },
  ],
};

const ARRIVE_2: ChecklistDef = {
  standard: "ARRIVE-2.0",
  label: "ARRIVE 2.0（动物实验）",
  source: "Percie du Sert N. et al., 2020",
  items: [
    { id: "1", section: "研究设计", text: "每个实验的对照组与实验组" },
    {
      id: "2",
      section: "样本量",
      text: "每组动物数与样本量确定依据",
      auto: hasField("n", (v) => typeof v === "number"),
    },
    { id: "3", section: "纳排与随机", text: "纳入/排除标准；如何分配到组（随机化）", auto: hasField("randomization") },
    { id: "4", section: "盲法", text: "分组/给药/结局评估是否设盲", auto: hasField("blinding", (v) => typeof v === "string" && v !== "无") },
    { id: "5", section: "结局指标", text: "预先定义的主要与次要结局" },
    { id: "6", section: "统计方法", text: "统计方法与分析单位" },
    { id: "7", section: "实验动物", text: "物种、品系、性别、年龄、来源" },
    { id: "8", section: "实验流程", text: "足够重复实验的细节（何时/何地/如何）" },
    { id: "9", section: "结果", text: "各结局的效应量与变异度", auto: hasField("effect_size") },
  ],
};

const STROBE: ChecklistDef = {
  standard: "STROBE",
  label: "STROBE（观察性研究：队列/病例对照/横断面）",
  source: "von Elm E. et al.",
  items: [
    { id: "1", section: "标题摘要", text: "标明研究设计；结构化摘要" },
    { id: "2", section: "背景", text: "科学背景与理由；具体目标/假设" },
    { id: "3", section: "设计", text: "研究设计要素" },
    { id: "4", section: "场所", text: "场所、地点、招募/暴露/随访时间" },
    { id: "5", section: "受试者", text: "资格标准、来源、选择方法" },
    { id: "6", section: "变量", text: "结局、暴露、预测因子、混淆、效应修饰因子" },
    { id: "7", section: "偏倚", text: "为处理潜在偏倚所做的努力" },
    { id: "8", section: "样本量", text: "如何确定样本量", auto: hasField("n", (v) => typeof v === "number") },
    { id: "9", section: "统计方法", text: "统计方法，含控制混淆的方法" },
    { id: "10", section: "结果·流程", text: "各阶段人数（参与/纳入/分析）" },
    { id: "11", section: "结果·估计", text: "未调整与调整后的估计值及精度（CI）", auto: hasField("effect_size") },
    { id: "12", section: "讨论", text: "关键结果、局限性、可推广性" },
  ],
};

export const CHECKLISTS: Record<string, ChecklistDef> = {
  "CONSORT-2025": CONSORT_2025,
  "PRISMA-2020": PRISMA_2020,
  "ARRIVE-2.0": ARRIVE_2,
  STROBE,
};

export interface ChecklistResult {
  def: ChecklistDef;
  rows: { item: ChecklistItem; done: boolean }[];
  completeness: { done: number; total: number };
}

export function evaluateChecklist(
  standard: string,
  nodes: ArgNode[],
): ChecklistResult | null {
  const def = CHECKLISTS[standard];
  if (!def) return null;
  const rows = def.items.map((item) => ({
    item,
    done: item.auto ? item.auto(nodes) : false,
  }));
  return {
    def,
    rows,
    completeness: { done: rows.filter((r) => r.done).length, total: rows.length },
  };
}

/** 导出为 Markdown 清单。 */
export function checklistToMarkdown(res: ChecklistResult): string {
  const { def, rows, completeness } = res;
  const lines = [
    `# ${def.label}`,
    ``,
    `> 规范来源：${def.source}（EQUATOR Network）。以下为代表性条目子集，正式投稿以官方最新版为准。`,
    ``,
    `完成度（可自动判定项）：${completeness.done} / ${completeness.total}`,
    ``,
    `| # | 章节 | 条目 | 状态 |`,
    `|---|---|---|---|`,
    ...rows.map(
      (r) =>
        `| ${r.item.id} | ${r.item.section} | ${r.item.text} | ${r.done ? "✓ 已覆盖" : "☐ 待填"} |`,
    ),
  ];
  return lines.join("\n");
}
