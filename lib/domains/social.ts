import type { DomainSchema } from "./types";

/**
 * 社会科学 (A.4)。
 * 节点类型来自 A.4.3，红队序列来自 A.4.4。
 * empiricalClaim（A.2.4 结尾）：identification_assumption / causal_claim /
 * measurement_validity 为 true；theoretical_frame / scope_condition 为 false
 * （框架与边界是约定性的）。
 * 论证重心不在"数据多好"，而在"识别策略是否可信"（可信性革命）。
 */
export const social: DomainSchema = {
  id: "social",
  label: "社会科学",
  criteria: ["识别策略 · 内外效度", "稳健性 · 适用边界"],
  methodologyBasis: "可信性革命的识别要求 · Campbell 内/外部效度",
  nodeTypes: [
    {
      id: "causal_claim",
      label: "因果主张",
      isAssumption: false,
      empiricalClaim: true,
      description: "必须附识别策略与中介机制",
    },
    {
      id: "identification_assumption",
      label: "识别假设",
      isAssumption: true,
      empiricalClaim: true,
      description: "核心：必须实质论证，不能只贴标签",
    },
    {
      id: "theoretical_frame",
      label: "理论框架",
      isAssumption: true,
      empiricalClaim: false,
      description: "框架是约定性的",
    },
    {
      id: "mechanism",
      label: "中介机制",
      isAssumption: true,
      empiricalClaim: true,
      description: "因果如何传导",
    },
    {
      id: "stat_evidence",
      label: "统计证据",
      isAssumption: false,
      empiricalClaim: true,
      description: "定量结果",
    },
    {
      id: "qual_evidence",
      label: "质性证据",
      isAssumption: false,
      empiricalClaim: true,
      description: "需反身性声明、三角验证",
    },
    {
      id: "measurement_validity",
      label: "测量效度",
      isAssumption: true,
      empiricalClaim: true,
      description: "概念与操作化指标之间的距离（构念效度）",
    },
    {
      id: "robustness_check",
      label: "稳健性检验",
      isAssumption: false,
      empiricalClaim: true,
      description: "换设定结果是否稳定",
    },
    {
      id: "scope_condition",
      label: "适用边界",
      isAssumption: true,
      empiricalClaim: false,
      description: "边界是约定性的：换时代/文化/制度是否成立",
    },
    {
      id: "placebo_test",
      label: "安慰剂检验",
      isAssumption: false,
      empiricalClaim: true,
      description: "证伪性检验设计",
    },
  ],
  domainFields: [
    {
      key: "identification_strategy",
      label: "识别策略",
      type: "select",
      required: true,
      options: ["RCT", "DID", "IV", "RDD", "匹配", "合成控制", "固定效应", "纯观察"],
    },
    {
      key: "internal_validity",
      label: "内部效度",
      type: "scale_1_5",
      required: true,
    },
    {
      key: "external_validity",
      label: "外部效度",
      type: "scale_1_5",
      required: true,
    },
    { key: "sample_frame", label: "抽样框", type: "text" },
    { key: "unit_of_analysis", label: "分析单位", type: "text" },
    { key: "preregistered", label: "预注册", type: "url" },
    { key: "multiple_testing", label: "多重检验校正", type: "text" },
    { key: "reflexivity", label: "研究者立场", type: "text" },
  ],
  evidenceRubric: {
    levels: [
      { strength: 5, label: "RCT / 设计精良的自然实验，识别假设充分论证" },
      { strength: 4, label: "准实验（DID/RDD/IV），核心假设有实证支持" },
      { strength: 3, label: "良好控制的观察研究" },
      { strength: 2, label: "横断面回归，混淆控制有限" },
      { strength: 1, label: "纯相关，无识别策略" },
    ],
    downgradeFactors: [
      "识别假设未论证",
      "内部效度低于 3",
      "未做稳健性检验",
      "存在未观测混淆",
    ],
  },
  redTeamSequence: [
    "识别策略是什么？其必要假设逐条是否论证过（而非仅贴标签）？",
    "内生性的具体来源：遗漏变量 / 反向因果 / 选择偏误 / 测量误差，逐项排查",
    "是否存在未观测混淆？若有，敏感性分析显示需要多强的混淆才能推翻结论？",
    "测量效度：指标与概念之间的距离有多大？",
    "换一组设定，结果是否稳定？做过安慰剂检验吗？",
    "内部效度是否被外部效度掩盖？（按 Campbell，内部效度优先）",
    "适用边界：换时代 / 换文化 / 换制度环境，结论还成立吗？",
    "多重假设检验是否校正？分析计划是否预注册？",
    "质性研究：反身性是否声明？数据是否饱和？有无三角验证？",
  ],
};
