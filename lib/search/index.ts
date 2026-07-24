import { searchOpenAlex } from "./openalex";
import { searchArxiv } from "./arxiv";
import type { SearchResult, SearchSource, SearchResponse } from "./types";

export type { SearchResult, SearchSource, SearchRequest, SearchResponse } from "./types";

/** 合并键：优先 DOI，其次 arXiv id，最后标题归一化。 */
function dedupeKey(r: SearchResult): string {
  if (r.doi) return `doi:${r.doi.toLowerCase()}`;
  if (r.arxiv_id) return `arxiv:${r.arxiv_id}`;
  return `title:${r.title.toLowerCase().replace(/[^a-z0-9一-龥]+/g, "")}`;
}

/** 合并两个来源，去重（同一篇论文 arXiv + OpenAlex 命中时保留信息更全者并补全 PDF 链接）。 */
export function mergeResults(lists: SearchResult[][]): SearchResult[] {
  const byKey = new Map<string, SearchResult>();
  for (const list of lists) {
    for (const r of list) {
      const key = dedupeKey(r);
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, { ...r });
      } else {
        // 合并：补全缺失字段，PDF 链接优先保留
        byKey.set(key, {
          ...existing,
          doi: existing.doi ?? r.doi,
          openalex_id: existing.openalex_id ?? r.openalex_id,
          arxiv_id: existing.arxiv_id ?? r.arxiv_id,
          abstract: existing.abstract ?? r.abstract,
          oa_pdf_url: existing.oa_pdf_url ?? r.oa_pdf_url,
          cited_by: existing.cited_by ?? r.cited_by,
          score: Math.max(existing.score ?? 0, r.score ?? 0),
        });
      }
    }
  }
  return Array.from(byKey.values()).sort(
    (a, b) => (b.score ?? 0) - (a.score ?? 0),
  );
}

/** 并发查询多个源，单源失败不影响其他源（§5.1 A：合并去重、按相关度排序）。 */
export async function runSearch(
  query: string,
  sources: SearchSource[] = ["openalex", "arxiv"],
  perSource = 10,
): Promise<SearchResponse> {
  const errors: SearchResponse["errors"] = [];
  const lists: SearchResult[][] = [];

  const tasks = sources.map(async (s) => {
    try {
      const fn = s === "openalex" ? searchOpenAlex : searchArxiv;
      lists.push(await fn(query, perSource));
    } catch (e) {
      errors.push({ source: s, message: e instanceof Error ? e.message : String(e) });
    }
  });
  await Promise.all(tasks);

  return { results: mergeResults(lists), errors };
}
