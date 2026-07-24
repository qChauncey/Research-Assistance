/**
 * 红队模式 —— 第 1 步：结构检查（§5.2 F / §6.6 / A.5.3）。
 *
 * 确定性 100%，纯代码，不用 LLM：这些是"能否被机械检出"的问题，答案不依赖判断。
 * 把能确定性检出的从需要 LLM 判断的（第 2 步领域序列）里分离出来——前者不该交给会幻觉的模型。
 *
 * 攻击清单来自领域共同体（Popper 可证伪性、Platt 强推断、CONSORT 清单、可信性革命），
 * 不是本工具发明的。
 */
import type { ArgNode, Domain, Evidence } from "./db/schema";
import { getNodeTypeDef, getDomain } from "./domains";
import { isEmpirical, isAssumption } from "./methodology";

export interface StructureIssue {
  code: string;
  message: string;
  /** warn = 计入健康度的问题；info = 提示 */
  severity: "warn" | "info";
  /** 依据（Popper/Platt/CONSORT/…） */
  basis: string;
}

/**
 * 对某节点跑确定性结构检查。
 * @param node 目标节点
 * @param domain 领域
 * @param nodes 全部节点（判断竞争假设/子节点）
 * @param evidence 全部证据（判断有无证据/反证据）
 */
export function structureCheck(
  node: ArgNode,
  domain: Domain,
  nodes: ArgNode[],
  evidence: Evidence[],
): StructureIssue[] {
  const issues: StructureIssue[] = [];
  const nodeEvidence = evidence.filter((e) => e.node_id === node.id);
  const children = nodes.filter((n) => n.parent_id === node.id);
  const typeDef = getNodeTypeDef(domain, node.node_type);
  const df = node.domain_fields ?? {};

  // —— 通用：缺失 falsifier（经验节点必填，Popper）——
  if (isEmpirical(node, domain)) {
    if (!node.falsifier || node.falsifier.trim() === "") {
      issues.push({
        code: "no_falsifier",
        message: "这个经验命题没有证伪条件：什么观察结果会推翻它？答不出则不是科学命题。",
        severity: "warn",
        basis: "Popper 可证伪性",
      });
    }
  }

  // —— 通用：无证据 ——
  if (nodeEvidence.length === 0) {
    issues.push({
      code: "no_evidence",
      message: "该节点尚无任何证据挂载（支持或反对皆无）。",
      severity: "warn",
      basis: "证据溯源",
    });
  }

  // —— 通用：反证据覆盖为零（确认偏误）——
  const hasContra = nodeEvidence.some((e) => e.stance === "contradicts");
  if (nodeEvidence.length > 0 && !hasContra) {
    issues.push({
      code: "no_counter_evidence",
      message: "只有支持性证据，无任何反证据。你认真找过反例了吗，还是只找了支持？",
      severity: "info",
      basis: "确认偏误 / 反证据对等",
    });
  }

  // —— 通用：单一假设风险（Platt 强推断）——
  // 解释性节点（有子假设）若只有一个候选假设，缺竞争解释。
  const assumptionChildren = children.filter((c) => isAssumption(c, domain));
  if (assumptionChildren.length === 1) {
    issues.push({
      code: "single_hypothesis",
      message: "只有一个候选假设，缺竞争解释。你在检验，还是在为这个假设辩护？",
      severity: "warn",
      basis: "Platt 强推断",
    });
  }

  // —— 物理：近似缺适用范围 ——
  if (domain === "physics") {
    if (node.node_type === "approximation" && !strOf(df.validity_range)) {
      issues.push({
        code: "approx_no_range",
        message: "近似未声明适用范围（validity_range）。下游是否越界使用？",
        severity: "warn",
        basis: "适用范围一致性",
      });
    }
    if (node.node_type === "limiting_case" && !strOf(df.reduces_to)) {
      issues.push({
        code: "limit_no_reduction",
        message: "极限退化未填写应退化到的已知结果（reduces_to）。",
        severity: "warn",
        basis: "对应原理",
      });
    }
    if (node.node_type === "derivation") {
      issues.push({
        code: "dim_check_manual",
        message: "推导含公式时应做量纲一致性校验（自动量纲校验在后续版本，暂需人工确认）。",
        severity: "info",
        basis: "量纲一致性",
      });
    }
  }

  // —— 实验科学：清单缺项（CONSORT/样本量/效应量）——
  if (domain === "experimental") {
    const isEvidenceNode = !isAssumption(node, domain);
    if (isEvidenceNode) {
      if (df.n == null) {
        issues.push({
          code: "missing_n",
          message: "未填样本量（n）。样本量与统计功效是否足够？",
          severity: "warn",
          basis: "CONSORT / 统计功效",
        });
      }
      if (!strOf(df.effect_size)) {
        issues.push({
          code: "missing_effect_size",
          message: "未报告效应量与置信区间（只报 p 值不够）。",
          severity: "warn",
          basis: "统计诚实性",
        });
      }
      if (!strOf(df.preregistered)) {
        issues.push({
          code: "no_prereg",
          message: "无预注册链接。分析计划是否事后修改？（HARKing 风险）",
          severity: "info",
          basis: "预注册 / 防 p-hacking",
        });
      }
    }
    if (node.node_type === "extrapolation") {
      issues.push({
        code: "extrapolation_gap",
        message: "外推跨越（体外→体内→动物→人）是独立假设，需声明依据——最常见的论证断裂点。",
        severity: "warn",
        basis: "外推跨度显式化",
      });
    }
  }

  // —— 社科：识别假设未论证 ——
  if (domain === "social") {
    if (node.node_type === "identification_assumption" && node.status === "open") {
      issues.push({
        code: "unjustified_identification",
        message: "识别假设仍为 open：必须实质论证（而非仅贴标签），可信性革命的核心要求。",
        severity: "warn",
        basis: "可信性革命 / 识别策略",
      });
    }
    if (node.node_type === "causal_claim") {
      const iv = df.internal_validity as number | undefined;
      if (iv != null && iv < 3) {
        issues.push({
          code: "low_internal_validity",
          message: "内部效度低于 3：无论外部效度多高，都不能标记为 supported（Campbell 优先内部效度）。",
          severity: "warn",
          basis: "Campbell 内/外部效度",
        });
      }
      if (!strOf(df.identification_strategy)) {
        issues.push({
          code: "no_identification_strategy",
          message: "因果主张未声明识别策略（RCT/DID/IV/RDD/…）。",
          severity: "warn",
          basis: "识别策略显式化",
        });
      }
    }
    if (node.node_type === "correlational") {
      issues.push({
        code: "correlation_not_causation",
        message: "相关性观察不可作为因果结论的直接父节点。",
        severity: "info",
        basis: "机制而非仅相关",
      });
    }
  }

  // 类型描述兜底（避免 typeDef 未用告警，同时给出上下文）
  if (!typeDef) {
    issues.push({
      code: "unknown_type",
      message: `未知节点类型「${node.node_type}」，不在领域「${getDomain(domain).label}」配置内。`,
      severity: "info",
      basis: "领域配置",
    });
  }

  return issues;
}

function strOf(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v);
}
