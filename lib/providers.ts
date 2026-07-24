/**
 * BYOK 模型服务商注册表（Phase 3 地基）。
 *
 * 目标：尽量兼容大部分模型与配置。每个服务商声明它的 API 形态（anthropic / openai 兼容）、
 * 默认 base URL、预设模型、以及官方文档链接。DeepSeek / OpenRouter / 硅基流动 / Ollama
 * 等都是 OpenAI 兼容端点，共用一套请求形状。
 *
 * 模型 ID 说明：
 *  - Anthropic 的模型 ID 取自 claude-api 技能（权威、随版本更新）。
 *  - 其余服务商的模型列表是"已知当前值"的种子，可能随官方更新变化；每个服务商都允许
 *    自定义模型 ID（allowCustomModel），并附 docsUrl 供核对最新文档。
 */

/** API 请求/响应形状。anthropic = /v1/messages + x-api-key；openai = /chat/completions + Bearer。 */
export type ApiStyle = "anthropic" | "openai";

export interface ModelOption {
  id: string;
  label: string;
  /** 简短能力标注，帮助用户选择（如 推理 / 快速 / 便宜） */
  note?: string;
}

export interface ProviderPreset {
  id: string;
  label: string;
  apiStyle: ApiStyle;
  /** 默认 base URL；compatible 为空由用户填写 */
  baseUrl: string;
  /** 是否允许用户编辑 base URL（兼容端点/自建代理） */
  editableBaseUrl: boolean;
  keyPlaceholder: string;
  /** 预设模型（可为空 → 完全自定义） */
  models: ModelOption[];
  /** 是否允许手填模型 ID */
  allowCustomModel: boolean;
  /** 官方 API 文档，核对最新模型/参数 */
  docsUrl: string;
  note?: string;
}

export const PROVIDERS: ProviderPreset[] = [
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    apiStyle: "anthropic",
    baseUrl: "https://api.anthropic.com",
    editableBaseUrl: false,
    keyPlaceholder: "sk-ant-•••••••••••••••••••••••",
    // 模型 ID 来自 claude-api 技能（权威）
    models: [
      { id: "claude-opus-5", label: "Claude Opus 5", note: "最强推理/长程" },
      { id: "claude-opus-4-8", label: "Claude Opus 4.8" },
      { id: "claude-sonnet-5", label: "Claude Sonnet 5", note: "速度/智能均衡" },
      { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", note: "最快最省" },
      { id: "claude-fable-5", label: "Claude Fable 5", note: "最高能力" },
    ],
    allowCustomModel: true,
    docsUrl: "https://platform.claude.com/docs/en/about-claude/models/overview",
  },
  {
    id: "openai",
    label: "OpenAI",
    apiStyle: "openai",
    baseUrl: "https://api.openai.com/v1",
    editableBaseUrl: false,
    keyPlaceholder: "sk-•••••••••••••••••••••••",
    models: [
      { id: "gpt-5", label: "GPT-5" },
      { id: "gpt-5-mini", label: "GPT-5 mini", note: "快速/便宜" },
      { id: "gpt-4.1", label: "GPT-4.1" },
      { id: "gpt-4o", label: "GPT-4o" },
      { id: "o4-mini", label: "o4-mini", note: "推理" },
    ],
    allowCustomModel: true,
    docsUrl: "https://platform.openai.com/docs/models",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    apiStyle: "openai", // OpenAI 兼容
    baseUrl: "https://api.deepseek.com",
    editableBaseUrl: false,
    keyPlaceholder: "sk-•••••••••••••••••••••••",
    models: [
      { id: "deepseek-chat", label: "deepseek-chat (V3)", note: "通用/快速" },
      { id: "deepseek-reasoner", label: "deepseek-reasoner (R1)", note: "深度推理" },
    ],
    allowCustomModel: true,
    docsUrl: "https://api-docs.deepseek.com/",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    apiStyle: "openai",
    baseUrl: "https://openrouter.ai/api/v1",
    editableBaseUrl: false,
    keyPlaceholder: "sk-or-•••••••••••••••••••••••",
    models: [
      { id: "anthropic/claude-opus-4.1", label: "anthropic/claude-opus-4.1" },
      { id: "openai/gpt-4o", label: "openai/gpt-4o" },
      { id: "deepseek/deepseek-chat", label: "deepseek/deepseek-chat" },
      { id: "google/gemini-2.5-pro", label: "google/gemini-2.5-pro" },
      { id: "meta-llama/llama-3.3-70b-instruct", label: "llama-3.3-70b" },
    ],
    allowCustomModel: true,
    docsUrl: "https://openrouter.ai/docs",
    note: "聚合多家模型，模型 ID 形如 provider/model",
  },
  {
    id: "siliconflow",
    label: "硅基流动 SiliconFlow",
    apiStyle: "openai",
    baseUrl: "https://api.siliconflow.cn/v1",
    editableBaseUrl: false,
    keyPlaceholder: "sk-•••••••••••••••••••••••",
    models: [
      { id: "deepseek-ai/DeepSeek-V3", label: "DeepSeek-V3" },
      { id: "deepseek-ai/DeepSeek-R1", label: "DeepSeek-R1", note: "推理" },
      { id: "Qwen/Qwen2.5-72B-Instruct", label: "Qwen2.5-72B" },
    ],
    allowCustomModel: true,
    docsUrl: "https://docs.siliconflow.cn/",
  },
  {
    id: "ollama",
    label: "Ollama（本地）",
    apiStyle: "openai",
    baseUrl: "http://localhost:11434/v1",
    editableBaseUrl: true,
    keyPlaceholder: "ollama（本地无需 key，可留 'ollama'）",
    models: [
      { id: "llama3.3", label: "llama3.3" },
      { id: "qwen2.5", label: "qwen2.5" },
      { id: "deepseek-r1", label: "deepseek-r1" },
    ],
    allowCustomModel: true,
    docsUrl: "https://github.com/ollama/ollama/blob/main/docs/openai.md",
    note: "本地运行，浏览器需能访问该地址",
  },
  {
    id: "compatible",
    label: "兼容端点（自定义）",
    apiStyle: "openai",
    baseUrl: "",
    editableBaseUrl: true,
    keyPlaceholder: "你的 API key（如需要）",
    models: [],
    allowCustomModel: true,
    docsUrl: "",
    note: "任何 OpenAI 兼容的 /chat/completions 端点：填 Base URL + 模型 ID",
  },
];

export function getProvider(id: string): ProviderPreset | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/** 该服务商的默认模型（列表第一个，或空）。 */
export function defaultModel(providerId: string): string {
  return getProvider(providerId)?.models[0]?.id ?? "";
}

/** 组装最终请求用的 base URL（用户覆盖优先）。 */
export function resolveBaseUrl(providerId: string, userBaseUrl?: string): string {
  const p = getProvider(providerId);
  if (userBaseUrl && userBaseUrl.trim()) return userBaseUrl.trim().replace(/\/$/, "");
  return (p?.baseUrl ?? "").replace(/\/$/, "");
}
