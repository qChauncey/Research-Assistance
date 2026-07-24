"use client";

/**
 * 客户端检索封装。
 * - 外部检索走我们的 /api/search（服务端调 OpenAlex/arXiv，避开 CORS）。
 * - 本地库检索：纯离线时对已上传文献的 extracted_text 做关键词匹配
 *   （§1.1：纯离线模式下语义检索降级为本地关键词检索）。
 */
import type { SearchResult, SearchResponse, SearchSource } from "./types";
import type { LibraryItem } from "@/lib/db/schema";

export async function searchExternal(
  query: string,
  sources: SearchSource[] = ["openalex", "semanticscholar", "arxiv"],
): Promise<SearchResponse> {
  const res = await fetch("/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, sources }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error ?? `检索失败 ${res.status}`);
  }
  return (await res.json()) as SearchResponse;
}

/** 本地库关键词检索（离线可用）：匹配标题/作者/摘要/全文。 */
export function searchLocalLibrary(
  library: LibraryItem[],
  query: string,
): { item: LibraryItem; snippet?: string }[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const terms = q.split(/\s+/).filter(Boolean);
  const out: { item: LibraryItem; snippet?: string; score: number }[] = [];

  for (const item of library) {
    const hay = [
      item.title,
      item.authors?.join(" "),
      item.abstract,
      item.extracted_text,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    let score = 0;
    for (const t of terms) {
      const idx = hay.indexOf(t);
      if (idx >= 0) score += 1;
    }
    if (score > 0) {
      // 从全文里截一段命中的上下文
      let snippet: string | undefined;
      if (item.extracted_text) {
        const lower = item.extracted_text.toLowerCase();
        const hit = lower.indexOf(terms[0]);
        if (hit >= 0) {
          const start = Math.max(0, hit - 60);
          snippet =
            (start > 0 ? "…" : "") +
            item.extracted_text.slice(start, hit + 120).trim() +
            "…";
        }
      }
      out.push({ item, snippet, score });
    }
  }
  return out
    .sort((a, b) => b.score - a.score)
    .map(({ item, snippet }) => ({ item, snippet }));
}

/** 把检索结果转成文献库条目（仅元数据）。 */
export function resultToLibraryItem(
  r: SearchResult,
): Omit<LibraryItem, "id" | "project_id" | "added_at"> {
  return {
    title: r.title,
    authors: r.authors,
    year: r.year,
    venue: r.venue,
    doi: r.doi,
    openalex_id: r.openalex_id,
    arxiv_id: r.arxiv_id,
    cited_by: r.cited_by,
    abstract: r.abstract,
    url: r.url,
    oa_pdf_url: r.oa_pdf_url,
    fulltext_status: r.oa_pdf_url ? "fulltext_available" : "metadata_only",
    fulltext_source: r.oa_pdf_url ? (r.source === "arxiv" ? "arxiv" : "publisher_oa") : undefined,
    read_status: "unread",
  };
}
