import { searchOpenAlex } from "./openalex";
import { searchArxiv } from "./arxiv";
import { searchSemanticScholar } from "./semanticscholar";
import type { SearchResult, SearchSource, SearchResponse } from "./types";

export type { SearchResult, SearchSource, SearchRequest, SearchResponse } from "./types";

/** 标题归一化：Unicode 折叠 + 去重音 + 小写 + 去所有非字母数字（含空格/标点/arXiv 版本号）。 */
function titleKey(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // 去组合重音符
    .toLowerCase()
    .replace(/\bv\d+\b/g, "")
    .replace(/[^a-z0-9一-鿿]+/g, "");
}

/** 一条结果的全部去重键（标题 / DOI / arXiv / OpenAlex id）。共享任一键即视为同一篇。 */
function keysOf(r: SearchResult): string[] {
  const ks: string[] = [];
  const tk = titleKey(r.title);
  if (tk.length >= 8) ks.push(`t:${tk}`);
  if (r.doi) ks.push(`doi:${r.doi.toLowerCase()}`);
  if (r.arxiv_id) ks.push(`arxiv:${r.arxiv_id.toLowerCase()}`);
  if (r.openalex_id) ks.push(`oa:${r.openalex_id.toLowerCase()}`);
  if (ks.length === 0) ks.push(`t:${tk}`);
  return ks;
}

/** 源可信度基准（同行评审优先，预印本次之）。 */
function sourceTrust(s: SearchSource): number {
  if (s === "openalex" || s === "semanticscholar") return 0.12;
  return 0; // arxiv 预印本
}

/** 非同行评审判定：预印本 / 开放仓库（Zenodo、figshare、SSRN、viXra 等）/ 数据集。
 *  这类来源任何人都能上传、通常未经同行评审，质量参差，应下沉（issue 2/4）。 */
const REPO_RE =
  /zenodo|figshare|\bosf\b|ssrn|researchgate|academia\.edu|vixra|preprints?\.org|authorea|biorxiv|medrxiv|chemrxiv|techrxiv|psyarxiv|\bhal\b|scienceopen|slideshare|preprint/i;

function hostOf(r: SearchResult): string {
  for (const u of [r.url, r.oa_pdf_url]) {
    if (u) {
      try {
        return new URL(u).hostname.toLowerCase();
      } catch {
        /* ignore */
      }
    }
  }
  return "";
}

function isNonPeerReviewed(r: SearchResult): boolean {
  const v = (r.venue ?? "").toLowerCase();
  const t = (r.pub_type ?? "").toLowerCase();
  if (
    ["preprint", "posted-content", "dataset", "report", "dissertation", "other", "paratext"].includes(
      t,
    )
  )
    return true;
  if (r.source === "arxiv") return true;
  if (v === "arxiv" || REPO_RE.test(v)) return true;
  if (REPO_RE.test(hostOf(r))) return true;
  return false;
}

/**
 * 质量分：相关度 + 引用（对数）+ 源可信度 + 同行评审加成；
 * 非同行评审（预印本/开放仓库/数据集）且低被引者下沉，无出处无引用者再沉，撤稿沉底。
 * 目的：把同行评审、被引用的专业论文排前面，把 Zenodo/viXra 类未审稿与伪科学排后面。
 */
function qualityScore(r: SearchResult): number {
  const rel = r.score ?? 0;
  const cites = Math.log10(1 + Math.max(0, r.cited_by ?? 0)); // 0..~5+
  const hasVenue = !!(r.venue && r.venue.trim());
  const nonPeer = isNonPeerReviewed(r);
  const peerReviewed = !!r.doi && hasVenue && !nonPeer;

  let v = rel + 0.28 * cites + sourceTrust(r.source);
  if (peerReviewed) v += 0.3;
  // 未经同行评审且鲜有引用 → 下沉（Zenodo/viXra/掠夺性 & 冷门预印本）
  if (nonPeer && (r.cited_by ?? 0) < 3) v -= 0.4;
  // 既无出处又零引用 → 再沉（多为低质/伪科学）
  if (!hasVenue && (r.cited_by ?? 0) === 0) v -= 0.5;
  if (r.retracted) v -= 5; // 撤稿沉底
  return v;
}

/** 合并两条同一篇论文：同行评审一方提供 venue/source，PDF/摘要取信息更全者，引用取较大值。 */
function mergeTwo(a: SearchResult, b: SearchResult): SearchResult {
  const peer = [a, b].find((x) => x.venue && !isNonPeerReviewed(x));
  return {
    ...a,
    source: peer?.source ?? a.source,
    venue: peer?.venue ?? a.venue ?? b.venue,
    pub_type: peer?.pub_type ?? a.pub_type ?? b.pub_type,
    doi: a.doi ?? b.doi,
    openalex_id: a.openalex_id ?? b.openalex_id,
    arxiv_id: a.arxiv_id ?? b.arxiv_id,
    abstract:
      (a.abstract?.length ?? 0) >= (b.abstract?.length ?? 0) ? a.abstract : b.abstract,
    url: a.url ?? b.url,
    oa_pdf_url: a.oa_pdf_url ?? b.oa_pdf_url,
    cited_by: Math.max(a.cited_by ?? 0, b.cited_by ?? 0) || undefined,
    retracted: a.retracted || b.retracted,
    score: Math.max(a.score ?? 0, b.score ?? 0),
  };
}

/**
 * 合并多个来源并去重（并查集：共享任一键——标题/DOI/arXiv/OpenAlex id——即归为一簇）。
 * 修复"检索里仍有重复"：同一篇论文在不同源可能只共享部分标识（如 arXiv 版有 arxiv_id、
 * 期刊版有 DOI），单键去重会漏；跨全部键做并查集才能彻底合并。
 */
export function mergeResults(lists: SearchResult[][]): SearchResult[] {
  const items = lists.flat();
  const parent = items.map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (a: number, b: number) => {
    parent[find(a)] = find(b);
  };

  const keyToIdx = new Map<string, number>();
  items.forEach((r, i) => {
    for (const k of keysOf(r)) {
      const j = keyToIdx.get(k);
      if (j !== undefined) union(i, j);
      else keyToIdx.set(k, i);
    }
  });

  const groups = new Map<number, SearchResult[]>();
  items.forEach((r, i) => {
    const root = find(i);
    const g = groups.get(root);
    if (g) g.push(r);
    else groups.set(root, [r]);
  });

  const merged = Array.from(groups.values()).map((cluster) => {
    const sorted = [...cluster].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    return sorted.reduce((acc, r) => mergeTwo(acc, r));
  });

  return merged
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
