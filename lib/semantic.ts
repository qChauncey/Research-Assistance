"use client";

/**
 * 语义/相关检索（BYOK LLM 查询扩展）。
 * 外部学术库是字面关键词匹配，找不到"换个说法表达同一观点"的论文。
 * 这里用模型把用户的主题/观点扩展成若干不同角度的检索式（同义/上位概念/方法/对立解释），
 * 分别检索再合并去重，从而召回"相似观点/相关论证"的文献，而非仅字面命中。
 */
import { chat, extractJSON } from "@/lib/llm/client";
import type { ApiConfig } from "@/lib/db/schema";

export async function expandQueries(
  cfg: ApiConfig | null,
  query: string,
  domainLabel: string,
  targetLangName: string,
  max = 3,
): Promise<string[]> {
  const reply = await chat(cfg, {
    messages: [
      {
        role: "user",
        content: [
          `研究者想找与下面主题/观点"相关"的论文——不仅是字面匹配，还包括：相近观点、`,
          `相关方法、上位/下位概念、以及 competing / 对立的解释。`,
          `研究领域：${domainLabel}`,
          `主题/观点：${query}`,
          ``,
          `请生成 ${max} 条不同角度的检索式（用${targetLangName}），每条 2–6 个关键词，`,
          `覆盖不同措辞与相关概念，避免与原词完全重复、避免整句话。`,
          `只输出 JSON：{"queries":["...","..."]}`,
        ].join("\n"),
      },
    ],
    maxTokens: 300,
  });
  const parsed = extractJSON<{ queries?: unknown[] }>(reply);
  const qs = (parsed?.queries ?? [])
    .map((s) => String(s).trim())
    .filter((s) => s.length > 0 && s.length < 120);
  return Array.from(new Set(qs)).slice(0, max);
}
