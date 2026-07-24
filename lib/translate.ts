"use client";

/**
 * 跨语言检索辅助（BYOK LLM）。
 * - 检索词翻译：把用户的检索词译到 language.search（学术库以英文为主），实现跨语言检索。
 * - 结果翻译：把标题/摘要译到 language.ui 作阅读辅助——
 *   注意原文标题在引用/入库时始终保留英文（§6.2 红线），译文仅供阅读。
 */
import { chat, extractJSON } from "@/lib/llm/client";
import type { ApiConfig } from "@/lib/db/schema";

/** 是否含 CJK（中日韩）字符——用于判断检索词与目标检索语言是否需要翻译。 */
export function hasCJK(s: string): boolean {
  return /[぀-ヿ㐀-鿿가-힯]/.test(s);
}

/** 语言代码 → 人类可读名（喂给模型的目标语言）。 */
export function langName(code: string): string {
  const c = (code || "").toLowerCase();
  if (c.startsWith("en")) return "English";
  if (c.startsWith("zh")) return "简体中文";
  if (c.startsWith("ja")) return "日本語";
  if (c.startsWith("ko")) return "한국어";
  if (c.startsWith("fr")) return "Français";
  if (c.startsWith("de")) return "Deutsch";
  if (c.startsWith("es")) return "Español";
  if (c.startsWith("ru")) return "Русский";
  return code || "English";
}

/** 目标检索语言是否为 CJK（判断跨语言需不需要翻译）。 */
export function isCJKLang(code: string): boolean {
  return /^(zh|ja|ko)/i.test(code || "");
}

/** 把检索词翻译到目标语言的学术关键词（只回一行关键词）。 */
export async function translateQuery(
  cfg: ApiConfig | null,
  query: string,
  targetLangName: string,
): Promise<string> {
  const reply = await chat(cfg, {
    messages: [
      {
        role: "user",
        content: `把下面的学术检索词翻译成${targetLangName}，只输出翻译后的检索关键词本身，不要引号、不要解释、不要标点包裹：\n${query}`,
      },
    ],
    maxTokens: 80,
  });
  return reply
    .trim()
    .replace(/^["'「」『』（）()]+|["'「」『』（）()]+$/g, "")
    .split("\n")[0]
    .trim();
}

/** 批量把标题/摘要翻译到目标语言，返回按输入下标索引的译文映射（阅读辅助）。 */
export async function translateResults(
  cfg: ApiConfig | null,
  items: { title: string; abstract?: string }[],
  targetLangName: string,
): Promise<Record<number, { title: string; abstract?: string }>> {
  if (items.length === 0) return {};
  const blocks = items
    .map(
      (it, i) =>
        `【${i + 1}】Title: ${it.title}\nAbstract: ${
          it.abstract ? it.abstract.slice(0, 600) : "(无)"
        }`,
    )
    .join("\n\n");
  const reply = await chat(cfg, {
    messages: [
      {
        role: "user",
        content: `把下列文献的标题与摘要翻译成${targetLangName}，仅作阅读辅助（引用时仍用英文原文，不要音译人名/术语出处）。逐条翻译，i 用序号；Abstract 为 (无) 则省略 abstract 字段。\n\n${blocks}\n\n只输出 JSON：{"items":[{"i":1,"title":"译文标题","abstract":"译文摘要"}]}`,
      },
    ],
    maxTokens: Math.min(3500, 500 + items.length * 130),
  });
  const parsed = extractJSON<{
    items?: { i?: number; title?: string; abstract?: string }[];
  }>(reply);
  const map: Record<number, { title: string; abstract?: string }> = {};
  for (const it of parsed?.items ?? []) {
    const idx = (it.i ?? 0) - 1;
    if (idx >= 0 && idx < items.length && it.title) {
      map[idx] = { title: it.title.trim(), abstract: it.abstract?.trim() || undefined };
    }
  }
  return map;
}
