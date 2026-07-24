/**
 * 方法论层判定 (约束三 · §5.2 G · A.5.2)。
 *
 * 核心：falsifier 只对 empiricalClaim: true 的节点强制。判定依据是领域配置里
 * nodeType 的 empiricalClaim 标志——不是节点 id，不是 isAssumption。三者正交。
 */
import type { ArgNode, Domain, Evidence } from "./db/schema";
import { getNodeTypeDef } from "./domains";

/** 该节点是否为经验节点（需要 falsifier）。 */
export function isEmpirical(node: ArgNode, domain: Domain): boolean {
  return getNodeTypeDef(domain, node.node_type)?.empiricalClaim ?? false;
}

/** 该节点是否为假设节点（触发虚线醒目样式，约束二）。 */
export function isAssumption(node: ArgNode, domain: Domain): boolean {
  return getNodeTypeDef(domain, node.node_type)?.isAssumption ?? false;
}

/**
 * 该节点是否缺失必填的 falsifier（→ 显示 ⚠）。
 * 只有经验节点、且 falsifier 为空时才算缺失。非经验节点永远不缺。
 */
export function isMissingFalsifier(node: ArgNode, domain: Domain): boolean {
  if (!isEmpirical(node, domain)) return false;
  return !node.falsifier || node.falsifier.trim() === "";
}

/**
 * 计算某节点写入时应有的 falsifier_status。
 * 非经验节点 → not_applicable（不计入警告，A.1.1）。
 * 经验节点 → 有内容 specified，无内容 unspecified（保留 tested_* 若已设置）。
 */
export function deriveFalsifierStatus(
  node: ArgNode,
  domain: Domain,
): ArgNode["falsifier_status"] {
  if (!isEmpirical(node, domain)) return "not_applicable";
  if (node.falsifier_status === "tested_survived" || node.falsifier_status === "tested_failed") {
    return node.falsifier_status;
  }
  return node.falsifier && node.falsifier.trim() !== "" ? "specified" : "unspecified";
}

export interface MaturityMetrics {
  nodeCount: number;
  /** 未审查的假设：无 falsifier、无证据、且从未被红队攻击的假设 */
  unreviewedAssumptions: { count: number; totalAssumptions: number };
  /** 无证据节点数 */
  noEvidenceNodes: number;
  /** 有反证据的节点数 / 总数（低于 20% 橙色警告） */
  contradictedNodes: { count: number; total: number };
  /** 不可证伪节点：分母只计 empiricalClaim: true 的节点（A.5.2） */
  unfalsifiable: { count: number; empiricalTotal: number };
  /** 最长未审阅天数 */
  oldestUnreviewedDays: number;
}

/**
 * 计算成熟度诚实指标（§5.2 G）。
 * 注意 A.5.2：不设"假设占比"类指标——任何惩罚诚实标注本身的指标都会被 Goodhart 反噬。
 * 指标盯的永远是"审查是否发生"，不是"结构长什么样"。
 */
export function computeMaturity(
  nodes: ArgNode[],
  evidence: Evidence[],
  domain: Domain,
): MaturityMetrics {
  const evidenceByNode = new Map<string, Evidence[]>();
  for (const e of evidence) {
    const arr = evidenceByNode.get(e.node_id) ?? [];
    arr.push(e);
    evidenceByNode.set(e.node_id, arr);
  }

  const assumptions = nodes.filter((n) => isAssumption(n, domain));
  const empiricalNodes = nodes.filter((n) => isEmpirical(n, domain));

  let unreviewedAssumptions = 0;
  for (const n of assumptions) {
    const ev = evidenceByNode.get(n.id) ?? [];
    const hasFalsifier = !!n.falsifier && n.falsifier.trim() !== "";
    const attacked = (n.methodology_flags?.length ?? 0) > 0;
    if (!hasFalsifier && ev.length === 0 && !attacked) unreviewedAssumptions++;
  }

  const noEvidenceNodes = nodes.filter(
    (n) => (evidenceByNode.get(n.id) ?? []).length === 0,
  ).length;

  const contradictedCount = nodes.filter((n) =>
    (evidenceByNode.get(n.id) ?? []).some((e) => e.stance === "contradicts"),
  ).length;

  const unfalsifiable = empiricalNodes.filter(
    (n) => !n.falsifier || n.falsifier.trim() === "",
  ).length;

  let oldestDays = 0;
  const now = Date.now();
  for (const n of nodes) {
    const days = Math.floor((now - new Date(n.updated_at).getTime()) / 86_400_000);
    if (days > oldestDays) oldestDays = days;
  }

  return {
    nodeCount: nodes.length,
    unreviewedAssumptions: {
      count: unreviewedAssumptions,
      totalAssumptions: assumptions.length,
    },
    noEvidenceNodes,
    contradictedNodes: { count: contradictedCount, total: nodes.length },
    unfalsifiable: { count: unfalsifiable, empiricalTotal: empiricalNodes.length },
    oldestUnreviewedDays: oldestDays,
  };
}

/** 反证据覆盖率是否过低（< 20% → 橙色警告）。 */
export function isLowContradictionCoverage(m: MaturityMetrics): boolean {
  if (m.contradictedNodes.total === 0) return false;
  return m.contradictedNodes.count / m.contradictedNodes.total < 0.2;
}

/**
 * 方法论健康度全表（§5.2 G 下半 · A.5.2）。领域相关：只在适用领域计相应指标。
 */
export interface MethodologyHealth {
  /** 不可证伪节点：分母只计 empiricalClaim 节点（A.5.2） */
  unfalsifiable: { count: number; empiricalTotal: number };
  /** 单一假设节点（Platt）：解释性节点只有一个候选假设 */
  singleHypothesis: number;
  /** 未论证的识别假设（社科专有）：identification_assumption 仍为 open */
  unjustifiedIdentification: number;
  /** 越界使用的近似（物理专有）：approximation 缺 validity_range */
  approxOutOfRange: number;
  /** 未验证的外推跨越（实验科学专有）：extrapolation 节点数 */
  extrapolationGaps: number;
  /** 退化纲领信号（Lakatos）：hard_core 下有保护带修订但无新预测 */
  degeneratingProgram: number;
  /** 是否有清单绑定（实验科学 + 已选设计） */
  hasChecklist: boolean;
  /** 综合健康分 0..100（用于头部与 80% 提示） */
  score: number;
}

function strField(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v);
}

export function computeMethodologyHealth(
  nodes: ArgNode[],
  domain: Domain,
): MethodologyHealth {
  const empiricalNodes = nodes.filter((n) => isEmpirical(n, domain));
  const unfalsifiable = empiricalNodes.filter(
    (n) => !n.falsifier || n.falsifier.trim() === "",
  ).length;

  // 单一假设（Platt）：某节点的假设型子节点恰好只有 1 个
  let singleHypothesis = 0;
  for (const n of nodes) {
    const assumptionChildren = nodes.filter(
      (c) => c.parent_id === n.id && isAssumption(c, domain),
    );
    if (assumptionChildren.length === 1) singleHypothesis++;
  }

  const unjustifiedIdentification =
    domain === "social"
      ? nodes.filter(
          (n) => n.node_type === "identification_assumption" && n.status === "open",
        ).length
      : 0;

  const approxOutOfRange =
    domain === "physics"
      ? nodes.filter(
          (n) =>
            n.node_type === "approximation" &&
            !strField(n.domain_fields?.validity_range),
        ).length
      : 0;

  const extrapolationGaps =
    domain === "experimental"
      ? nodes.filter((n) => n.node_type === "extrapolation").length
      : 0;

  // 退化纲领：hard_core 节点，其子树含 protective_belt 但无 novel_prediction
  let degeneratingProgram = 0;
  const byParent = new Map<string, ArgNode[]>();
  for (const n of nodes) {
    const arr = byParent.get(n.parent_id ?? "") ?? [];
    arr.push(n);
    byParent.set(n.parent_id ?? "", arr);
  }
  function descendants(id: string): ArgNode[] {
    const out: ArgNode[] = [];
    const stack = [...(byParent.get(id) ?? [])];
    while (stack.length) {
      const c = stack.pop()!;
      out.push(c);
      stack.push(...(byParent.get(c.id) ?? []));
    }
    return out;
  }
  for (const n of nodes) {
    if (n.program_role === "hard_core") {
      const desc = descendants(n.id);
      const belts = desc.filter((d) => d.program_role === "protective_belt").length;
      const novels = desc.filter((d) => d.program_role === "novel_prediction").length;
      if (belts >= 3 && novels === 0) degeneratingProgram++;
    }
  }

  // 综合健康分：以"审查是否发生"为主，问题越多分越低（诚实标注不惩罚）
  const problems =
    unfalsifiable +
    singleHypothesis +
    unjustifiedIdentification +
    approxOutOfRange +
    extrapolationGaps +
    degeneratingProgram;
  const denom = Math.max(nodes.length, 1);
  const score = Math.max(0, Math.round(100 * (1 - problems / (denom * 1.5))));

  return {
    unfalsifiable: { count: unfalsifiable, empiricalTotal: empiricalNodes.length },
    singleHypothesis,
    unjustifiedIdentification,
    approxOutOfRange,
    extrapolationGaps,
    degeneratingProgram,
    hasChecklist: domain === "experimental",
    score,
  };
}
