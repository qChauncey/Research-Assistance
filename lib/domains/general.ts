import type { DomainSchema } from "./types";

/**
 * 通用领域 (A.1) —— 科学哲学基础。
 * Popper 可证伪性 · Platt 强推断 · Lakatos 研究纲领 · 贝叶斯更新。
 * general 是范围最宽的领域，节点类型综合 A.1 各框架，empiricalClaim 严格按 A.1.1 范畴区分。
 */
export const general: DomainSchema = {
  id: "general",
  label: "通用",
  criteria: ["可证伪性", "强推断", "研究纲领"],
  methodologyBasis: "Popper 可证伪性 · Platt 强推断 · Lakatos 研究纲领",
  nodeTypes: [
    {
      id: "core_claim",
      label: "核心命题",
      isAssumption: false,
      empiricalClaim: true,
      description: "树的根论点，需要证伪条件",
    },
    {
      id: "hypothesis",
      label: "假设",
      isAssumption: true,
      empiricalClaim: true,
      description: "待检验的经验假设，必须可证伪",
    },
    {
      id: "sub_claim",
      label: "子命题",
      isAssumption: false,
      empiricalClaim: true,
      description: "支撑核心命题的经验性论点",
    },
    {
      id: "mechanism",
      label: "机制",
      isAssumption: true,
      empiricalClaim: true,
      description: "解释因果如何发生的假说性机制",
    },
    {
      id: "derivation",
      label: "推导",
      isAssumption: false,
      empiricalClaim: false,
      description: "形式推导，校验完整性而非可证伪性",
    },
    {
      id: "definition",
      label: "定义",
      isAssumption: true,
      empiricalClaim: false,
      description: "约定而非事实，无所谓真假",
    },
    {
      id: "evidence_claim",
      label: "经验证据主张",
      isAssumption: false,
      empiricalClaim: true,
      description: "基于观测的经验主张",
    },
    {
      id: "crucial_experiment",
      label: "关键实验",
      isAssumption: false,
      empiricalClaim: true,
      description: "能一次区分多个竞争假设的设计（Platt），价值密度最高",
    },
    {
      id: "scope_condition",
      label: "适用边界",
      isAssumption: true,
      empiricalClaim: false,
      description: "结论在什么范围内成立",
    },
  ],
  domainFields: [],
  evidenceRubric: {
    levels: [
      { strength: 5, label: "强，可重复的直接证据" },
      { strength: 4, label: "较强，独立来源一致" },
      { strength: 3, label: "中等，单一良好来源" },
      { strength: 2, label: "弱，间接或相关性" },
      { strength: 1, label: "很弱，轶事/专家意见" },
    ],
    downgradeFactors: ["样本有限", "无独立复现", "存在明显混淆"],
  },
  redTeamSequence: [
    "这个命题的证伪条件是什么？若答不出，它是否为科学命题？（Popper）",
    "有没有竞争解释？只有一个假设时你在检验还是在辩护？（Platt）",
    "这一步默认了什么未声明的前提？（隐含前提审查）",
    "支持这个命题的证据，在竞争假设为真时是否也会出现？（诊断性 vs 一致性）",
    "最近的修订是新预测还是事后补丁？（Lakatos）",
    "反证据覆盖率为零时：你认真找过反例吗，还是只找了支持？（确认偏误）",
  ],
};
