import type { DomainSchema } from "./types";

/**
 * 理论物理 / 数学 (A.2)。
 * 节点类型来自 A.2.2，empiricalClaim 取值来自 A.2.4（物理层是范畴区分最关键的地方，
 * 因为它同时包含经验命题和纯形式命题），红队序列来自 A.2.3。
 * validity_range / reduces_to 的 requiredFor 直接照搬 A.2.2 domainFields。
 */
export const physics: DomainSchema = {
  id: "physics",
  label: "理论物理 / 数学",
  criteria: ["量纲 · 极限退化", "对称性 · 参数约束"],
  methodologyBasis: "量纲与极限一致性 · 对称性 · 参数可证伪性",
  nodeTypes: [
    // A.2.4：范畴区分——公理/推导/对称性/自洽是形式命题(false)，
    // ansatz/近似/极限退化/数值预测/实验约束是经验命题(true)。
    {
      id: "axiom",
      label: "公理/出发点",
      isAssumption: true,
      empiricalClaim: false,
      description: "校验是否声明为约定而非事实，不要求 falsifier",
    },
    {
      id: "derivation",
      label: "推导",
      isAssumption: false,
      empiricalClaim: false,
      description: "校验推导是否完整、量纲是否一致（形式正确性）",
    },
    {
      id: "ansatz",
      label: "试探假设",
      isAssumption: true,
      empiricalClaim: true,
      description: "需要 falsifier：什么结果表明这个试探形式错了",
    },
    {
      id: "approximation",
      label: "近似",
      isAssumption: true,
      empiricalClaim: true,
      description: "需要 falsifier + validity_range",
    },
    {
      id: "symmetry_argument",
      label: "对称性论证",
      isAssumption: false,
      empiricalClaim: false,
      description: "对称性是否真实成立（形式论证）",
    },
    {
      id: "limiting_case",
      label: "极限退化检验",
      isAssumption: false,
      empiricalClaim: true,
      description: "退化是否成立是可检验的",
    },
    {
      id: "numerical_prediction",
      label: "数值预测",
      isAssumption: false,
      empiricalClaim: true,
      description: "理论的可证伪出口，必须有 falsifier",
    },
    {
      id: "experimental_constraint",
      label: "实验约束",
      isAssumption: false,
      empiricalClaim: true,
      description: "与观测的兼容性",
    },
    {
      id: "consistency_check",
      label: "自洽性检验",
      isAssumption: false,
      empiricalClaim: false,
      description: "内部自洽（形式）",
    },
  ],
  domainFields: [
    {
      key: "validity_range",
      label: "适用范围",
      type: "text",
      requiredFor: ["approximation", "ansatz"],
    },
    { key: "expansion_order", label: "展开阶数", type: "text" },
    { key: "free_parameters", label: "自由参数数", type: "number" },
    { key: "dimensional_check", label: "量纲校验", type: "auto" },
    {
      key: "reduces_to",
      label: "退化到",
      type: "text",
      requiredFor: ["limiting_case"],
    },
  ],
  evidenceRubric: {
    levels: [
      { strength: 5, label: "多次独立实验精确验证" },
      { strength: 4, label: "关键实验验证" },
      { strength: 3, label: "与已知约束一致" },
      { strength: 2, label: "间接/唯象支持" },
      { strength: 1, label: "仅数值巧合" },
    ],
    downgradeFactors: ["自由参数过多", "仅事后拟合", "越出适用范围"],
  },
  redTeamSequence: [
    "量纲是否一致？（自动）",
    "取经典极限 / 低能极限 / 大 N 极限，是否退化到已知结果？",
    "这个近似的适用范围是什么？下游是否越界使用？",
    "有几个自由参数？调节它们能否匹配任意数据？若能，这个理论不可证伪",
    "破缺了什么对称性？守恒律如何处理？",
    "是否与现有实验排除区间冲突？（自动检索 PDG / 观测限）",
    "这个结果在另一个表象/规范下是否成立？",
  ],
};
