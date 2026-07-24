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
