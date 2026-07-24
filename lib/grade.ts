/**
 * GRADE 证据分级（Phase 2, A.3.2）。
 * strength 不由用户凭感觉给 1–5，而是按层级自动建议，并按情形自动降级。
 * 用户有权覆盖，但覆盖是主动动作（§A.6：给建议，不强制）。
 *
 * 仅实验科学有完整 GRADE 层级；其他领域回落到 evidenceRubric 的粗略映射。
 */
import type { ArgNode, Domain, EvidenceSourceType } from "./db/schema";

export interface GradeSuggestion {
  suggested: number; // 1..5
  base: number;
  baseReason: string;
  downgrades: string[];
}

// A.3.2 层级：按实验设计定基线
const DESIGN_BASE: Record<string, { level: number; label: string }> = {
  系统综述: { level: 5, label: "系统综述 / 元分析" },
  RCT: { level: 4, label: "随机对照试验" },
  队列: { level: 3, label: "前瞻队列" },
  动物实验: { level: 3, label: "良好对照的体内实验" },
  病例对照: { level: 2, label: "病例对照" },
  体外: { level: 2, label: "体外实验" },
  横断面: { level: 1, label: "横断面相关性" },
};

// 节点类型作为兜底基线（无 design 字段时）
const TYPE_BASE: Record<string, { level: number; label: string }> = {
  replication: { level: 4, label: "独立重复验证" },
  clinical: { level: 3, label: "临床证据" },
  in_vivo: { level: 3, label: "体内实验" },
  animal_model: { level: 3, label: "动物模型" },
  control_experiment: { level: 3, label: "对照实验" },
  in_vitro: { level: 2, label: "体外实验" },
  characterization: { level: 2, label: "表征/测量" },
  correlational: { level: 1, label: "相关性观察" },
};

const SOURCE_BASE: Record<EvidenceSourceType, number> = {
  paper: 3,
  dataset: 3,
  external_link: 2,
  user_reasoning: 1,
};

function num(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}

/**
 * 给某节点上的一条实验证据建议 GRADE 强度。
 * 依据节点的 domain_fields（design / n / blinding / preregistered / replications）。
 */
export function gradeExperimental(node: ArgNode): GradeSuggestion {
  const df = node.domain_fields;
  const design = df.design as string | undefined;

  let base: number;
  let baseReason: string;
  if (design && DESIGN_BASE[design]) {
    base = DESIGN_BASE[design].level;
    baseReason = DESIGN_BASE[design].label;
  } else if (TYPE_BASE[node.node_type]) {
    base = TYPE_BASE[node.node_type].level;
    baseReason = TYPE_BASE[node.node_type].label;
  } else {
    base = 2;
    baseReason = "默认（未指定设计）";
  }

  const downgrades: string[] = [];
  const n = num(df.n);
  if (n !== undefined && n < 30) downgrades.push("小样本 (n<30)");
  const blinding = df.blinding as string | undefined;
  if (blinding === "无") downgrades.push("无盲法");
  if (!df.preregistered) downgrades.push("无预注册");
  const reps = num(df.replications);
  if (reps !== undefined && reps < 1) downgrades.push("单一实验室 / 未独立重复");

  const suggested = Math.max(1, base - downgrades.length);
  return { suggested, base, baseReason, downgrades };
}

/** 通用建议：实验科学走 GRADE，其余领域按证据来源类型给粗略基线。 */
export function suggestStrength(
  node: ArgNode,
  domain: Domain,
  sourceType: EvidenceSourceType,
): GradeSuggestion {
  if (domain === "experimental") return gradeExperimental(node);
  const base = SOURCE_BASE[sourceType];
  return {
    suggested: base,
    base,
    baseReason:
      sourceType === "user_reasoning"
        ? "用户推理（非文献）"
        : sourceType === "paper"
          ? "文献"
          : sourceType === "dataset"
            ? "数据集"
            : "外部链接",
    downgrades: [],
  };
}
