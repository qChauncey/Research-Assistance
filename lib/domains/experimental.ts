import type { DomainSchema } from "./types";

/**
 * 实验科学（生物 / 化学 / 实验物理）(A.3)。
 * 节点类型来自 A.3.3，红队序列来自 A.3.4，清单绑定来自 A.3.3 checklistBinding。
 *
 * empiricalClaim 取值（依据 A.2.4 结尾说明）：
 *   mechanism / extrapolation 是假说性节点 → empiricalClaim: true，需单独填 falsifier。
 *   实验证据类节点本身即观测，其"证伪条件由研究设计承担而非单独填写"（A.2.4），
 *   因此这里置 empiricalClaim: false，避免对纯观测节点强加冗余的独立 falsifier 字段
 *   ——它们的可证伪性由 n / power / blinding / effect_size 等设计字段承载，
 *   并计入方法论健康度而非"不可证伪节点"分母（A.5.2）。
 */
export const experimental: DomainSchema = {
  id: "experimental",
  label: "实验科学",
  criteria: ["生物·化学·实验物理", "CONSORT · PRISMA · ARRIVE · GRADE"],
  methodologyBasis: "CONSORT 2025 · STROBE · ARRIVE · PRISMA 2020 · GRADE",
  nodeTypes: [
    {
      id: "mechanism",
      label: "机制假说",
      isAssumption: true,
      empiricalClaim: true,
      description: "假说性机制，需要证伪条件",
    },
    {
      id: "in_vitro",
      label: "体外实验",
      isAssumption: false,
      empiricalClaim: false,
      description: "观测证据，证伪条件由研究设计承担",
    },
    {
      id: "in_vivo",
      label: "体内实验",
      isAssumption: false,
      empiricalClaim: false,
      description: "观测证据，证伪条件由研究设计承担",
    },
    {
      id: "animal_model",
      label: "动物模型",
      isAssumption: false,
      empiricalClaim: false,
      description: "观测证据，证伪条件由研究设计承担",
    },
    {
      id: "clinical",
      label: "临床证据",
      isAssumption: false,
      empiricalClaim: false,
      description: "观测证据，证伪条件由研究设计承担",
    },
    {
      id: "correlational",
      label: "相关性观察",
      isAssumption: false,
      empiricalClaim: false,
      description: "仅相关，不可作为因果结论的直接父节点",
    },
    {
      id: "extrapolation",
      label: "外推跨越",
      isAssumption: true,
      empiricalClaim: true,
      description: "体外→体内→动物→人，每跨一级都是独立假设，最常见的论证断裂点",
    },
    {
      id: "characterization",
      label: "表征/测量",
      isAssumption: false,
      empiricalClaim: false,
      description: "表征手段，单一手段不足以确证",
    },
    {
      id: "control_experiment",
      label: "对照实验",
      isAssumption: false,
      empiricalClaim: false,
      description: "阴性/阳性对照",
    },
    {
      id: "replication",
      label: "重复验证",
      isAssumption: false,
      empiricalClaim: false,
      description: "独立重复",
    },
  ],
  domainFields: [
    {
      key: "design",
      label: "研究设计",
      type: "select",
      options: ["RCT", "队列", "病例对照", "横断面", "体外", "动物实验", "系统综述"],
    },
    { key: "n", label: "样本量", type: "number", required: true },
    { key: "power", label: "统计功效", type: "number" },
    {
      key: "blinding",
      label: "盲法",
      type: "select",
      options: ["无", "单盲", "双盲", "三盲"],
    },
    { key: "randomization", label: "随机化方式", type: "text" },
    { key: "preregistered", label: "预注册链接", type: "url" },
    { key: "effect_size", label: "效应量与CI", type: "text", required: true },
    { key: "data_available", label: "原始数据可得", type: "boolean" },
    { key: "replications", label: "独立重复次数", type: "number" },
  ],
  // 按 design 自动加载对应报告规范清单（A.3.3）
  checklistBinding: {
    RCT: "CONSORT-2025",
    队列: "STROBE",
    病例对照: "STROBE",
    动物实验: "ARRIVE-2.0",
    系统综述: "PRISMA-2020",
  },
  evidenceRubric: {
    // GRADE 改造（A.3.2）——按层级自动建议 strength
    levels: [
      { strength: 5, label: "系统综述 / 元分析（低异质性）" },
      { strength: 4, label: "随机对照试验 / 预注册重复实验" },
      { strength: 3, label: "前瞻队列 / 良好对照的体内实验" },
      { strength: 2, label: "病例对照 / 体外实验 / 单次未重复实验" },
      { strength: 1, label: "横断面相关性 / 病例报告 / 专家意见" },
    ],
    downgradeFactors: [
      "小样本",
      "无盲法",
      "无预注册",
      "单一实验室",
      "效应量接近检出限",
    ],
  },
  redTeamSequence: [
    "样本量与统计功效是否足够？效应量是否报告？",
    "对照组设置是否恰当？有无必要的阴性/阳性对照？",
    "盲法与随机化是否到位？",
    "是否预注册？分析计划是否事后修改？（HARKing 检查）",
    "是否存在批次效应 / 实验室特异性？有无独立重复？",
    "从体外到体内、从动物到人的外推跨度有多大？依据是什么？",
    "该领域是否为可重复性危机高发区？（自动检索该主题的重复失败记录）",
    "表征手段是否单一？有无正交验证？",
    "检索是否存在已注册但未发表的同主题研究？（发表偏倚）",
  ],
};
