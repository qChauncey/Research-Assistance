/**
 * 领域 Schema 系统 (§3)。
 * base schema + 领域配置。加第五个领域是写一份配置，不是开一个分支（约束六）。
 * 领域差异只体现在三处：节点类型枚举、证据强度标准、红队序列。其余全部共享。
 */

export interface NodeTypeDef {
  id: string;
  label: string;
  /** 决定是否触发醒目样式（虚线边框 + 全大写标签）。约束二：按此字段，不按节点 id。 */
  isAssumption: boolean;
  /**
   * 决定是否强制 falsifier 字段（A.1.1）。
   * 与 isAssumption 正交：ansatz 既是假设也是经验主张；
   * definition 是假设但非经验主张；derivation 两者皆非。
   */
  empiricalClaim: boolean;
  description: string;
}

/** 领域字段定义（domain_fields 的表单驱动）。 */
export interface FieldDef {
  key: string;
  label: string;
  type: "text" | "number" | "url" | "boolean" | "select" | "scale_1_5" | "auto";
  options?: string[];
  /** 对某些节点类型必填 */
  requiredFor?: string[];
  /** 对所有节点类型必填 */
  required?: boolean;
}

/** 证据强度评定标准（GRADE 改造等）。Phase 1 仅作说明展示。 */
export interface EvidenceRubric {
  /** 强度 5→1 的层级描述 */
  levels: { strength: number; label: string }[];
  /** 自动降级情形说明 */
  downgradeFactors: string[];
}

export interface DomainSchema {
  id: string;
  label: string;
  /** 卡片上显示的判据（非泛泛描述），让用户立刻理解选择的后果（§6.1 步骤 3）。 */
  criteria: string[];
  /** 方法论依据一行 */
  methodologyBasis: string;
  nodeTypes: NodeTypeDef[];
  domainFields: FieldDef[];
  evidenceRubric: EvidenceRubric;
  /** 领域特化的红队序列（A.1.5 / A.2.3 / A.3.4 / A.4.4）。Phase 1 只存不执行。 */
  redTeamSequence: string[];
  /** 按 design 自动加载的报告规范清单绑定（实验科学） */
  checklistBinding?: Record<string, string>;
}
