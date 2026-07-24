import { searchOpenAlex } from "./openalex";
import { searchArxiv } from "./arxiv";
import { searchSemanticScholar } from "./semanticscholar";
import type { SearchResult, SearchSource, SearchResponse } from "./types";

export type { SearchResult, SearchSource, SearchRequest, SearchResponse } from "./types";

/** 标题归一化：小写、去所有非字母数字（含空格/标点/arXiv 版本号），用于跨源去重。 */
function titleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/\bv\d+\b/g, "")
    .replace(/[^a-z0-9一-鿿]+/g, "");
}

/**
 * 去重键：以归一化标题为主（同一篇论文 arXiv 预印本与期刊版标题相同但 DOI/ID 不同，
 * 只有按标题才能合并，修复"检索里出现重复论文"）；标题缺失时退回 DOI/ID。
 */
function dedupeKey(r: SearchResult): string {
  const tk = titleKey(r.title);
  if (tk.length >= 8) return `t:${tk}`;
  if (r.doi) return `doi:${r.doi.toLowerCase()}`;
  if (r.arxiv_id) return `arxiv:${r.arxiv_id}`;
  if (r.openalex_id) return `oa:${r.openalex_id}`;
  return `t:${tk}`;
}

/** 源可信度基准（同行评审优先，预印本次之）。 */
function sourceTrust(s: SearchSource): number {
  if (s === "openalex") return 0.12;
  if (s === "semanticscholar") return 0.12;
  return 0; // arxiv 预印本
}

/** 预印本 / 无出处判定（用于压低低质结果）。 */
function isPreprint(r: SearchResult): boolean {
  const v = (r.venue ?? "").toLowerCase();
  return (
    r.source === "arxiv" ||
    v === "arxiv" ||
    v.includes("preprint") ||
    v.includes("ssrn") ||
    v.includes("researchgate") ||
    /^biorxiv|^medrxiv/.test(v) ||
    (r.pub_type ?? "").toLowerCase() === "preprint"
  );
}

/**
 * 质量分：相关度 + 引用（对数）+ 源可信度 + 同行评审加成；无出处无引用的结果下沉。
 * 目的：把同行评审、被引用的专业论文排前面，把伪科学/无出处结果排后面（issue 4）。
 */
function qualityScore(r: SearchResult): number {
  const rel = r.score ?? 0;
  const cites = Math.log10(1 + Math.max(0, r.cited_by ?? 0)); // 0..~5+
  const hasVenue = !!(r.venue && r.venue.trim());
  const peerReviewed = !!r.doi && hasVenue && !isPreprint(r);

  let v = rel + 0.28 * cites + sourceTrust(r.source);
  if (peerReviewed) v += 0.3;
  if (isPreprint(r)) v -= 0.05;
  // 无出处且零引用：多为低质/掠夺性/伪科学 → 明显下沉
  if (!hasVenue && (r.cited_by ?? 0) === 0) v -= 0.5;
  if (r.retracted) v -= 5; // 撤稿沉底
  return v;
}

/** 合并两个来源，去重（同一篇论文多源命中时保留信息更全者并补全 PDF 链接）。 */
export function mergeResults(lists: SearchResult[][]): SearchResult[] {
  const byKey = new Map<string, SearchResult>();
  for (const list of lists) {
    for (const r of list) {
      const key = dedupeKey(r);
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, { ...r });
      } else {
        // 同一篇论文多源命中：让同行评审的一方提供 venue/source（预印本版本让位），
        // 其余字段补全、PDF/摘要取信息更全者、引用取较大值。
        const peer = [existing, r].find((x) => x.venue && !isPreprint(x));
        byKey.set(key, {
          ...existing,
          source: peer?.source ?? existing.source,
          venue: peer?.venue ?? existing.venue ?? r.venue,
          pub_type: peer?.pub_type ?? existing.pub_type ?? r.pub_type,
          doi: existing.doi ?? r.doi,
          openalex_id: existing.openalex_id ?? r.openalex_id,
          arxiv_id: existing.arxiv_id ?? r.arxiv_id,
          abstract:
            (existing.abstract?.length ?? 0) >= (r.abstract?.length ?? 0)
              ? existing.abstract
              : r.abstract,
          url: existing.url ?? r.url,
          oa_pdf_url: existing.oa_pdf_url ?? r.oa_pdf_url,
          cited_by: Math.max(existing.cited_by ?? 0, r.cited_by ?? 0) || undefined,
          retracted: existing.retracted || r.retracted,
          score: Math.max(existing.score ?? 0, r.score ?? 0),
        });
      }
    }
  }
  return Array.from(byKey.values())
    .filter((r) => !r.retracted)
    .sort((a, b) => qualityScore(b) - qualityScore(a));
}

/** 并发查询多个源，单源失败不影响其他源（§5.1 A：合并去重、按质量+相关度排序）。 */
export async function runSearch(
  query: string,
  sources: SearchSource[] = ["openalex", "semanticscholar", "arxiv"],
  perSource = 10,
): Promise<SearchResponse> {
  const errors: SearchResponse["errors"] = [];
  const lists: SearchResult[][] = [];

  const fnFor = (s: SearchSource) =>
    s === "openalex"
      ? searchOpenAlex
      : s === "semanticscholar"
        ? searchSemanticScholar
        : searchArxiv;

  const tasks = sources.map(async (s) => {
    try {
      lists.push(await fnFor(s)(query, perSource));
    } catch (e) {
      errors.push({ source: s, message: e instanceof Error ? e.message : String(e) });
    }
  });
  await Promise.all(tasks);

  return { results: mergeResults(lists), errors };
}
