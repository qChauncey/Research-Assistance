import type { SearchResult } from "./types";

/**
 * Semantic Scholar 客户端（服务端调用）。
 * 相比 arXiv，S2 覆盖同行评审文献并带质量信号（引用数、venue、publicationTypes），
 * 有助于把低质/伪科学结果排到后面（Google Scholar 无官方 API，S2 是最接近的合规替代）。
 * 无 key 时走公共限流池（偶发 429），失败不影响其它源。
 */
const BASE = "https://api.semanticscholar.org/graph/v1/paper/search";
const FIELDS =
  "title,abstract,year,venue,citationCount,externalIds,authors,openAccessPdf,publicationTypes,url,isOpenAccess";

interface S2Paper {
  paperId?: string;
  title?: string;
  abstract?: string;
  year?: number;
  venue?: string;
  citationCount?: number;
  externalIds?: { DOI?: string; ArXiv?: string; PubMed?: string };
  authors?: { name?: string }[];
  openAccessPdf?: { url?: string } | null;
  publicationTypes?: string[] | null;
  url?: string;
}

export async function searchSemanticScholar(
  query: string,
  limit = 10,
): Promise<SearchResult[]> {
  const url = new URL(BASE);
  url.searchParams.set("query", query);
  url.searchParams.set("limit", String(Math.min(limit, 25)));
  url.searchParams.set("fields", FIELDS);

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": "ArgumentTree/1.0 (research assistant)" },
    signal: AbortSignal.timeout(9000),
  });
  if (!res.ok) throw new Error(`SemanticScholar ${res.status}`);
  const data = (await res.json()) as { data?: S2Paper[] };

  return (data.data ?? [])
    .filter((p) => p.title)
    .map((p, i): SearchResult => {
      const arxiv = p.externalIds?.ArXiv;
      const pubTypes = p.publicationTypes ?? [];
      return {
        source: "semanticscholar",
        title: (p.title ?? "(untitled)").trim(),
        authors: (p.authors ?? [])
          .map((a) => a?.name)
          .filter((x): x is string => !!x),
        year: p.year,
        venue: p.venue || undefined,
        doi: p.externalIds?.DOI,
        arxiv_id: arxiv,
        cited_by: p.citationCount,
        abstract: p.abstract
          ? p.abstract.length > 1200
            ? p.abstract.slice(0, 1200) + "…"
            : p.abstract
          : undefined,
        url: p.url,
        oa_pdf_url:
          p.openAccessPdf?.url ??
          (arxiv ? `https://arxiv.org/pdf/${arxiv}` : undefined),
        pub_type: pubTypes[0],
        score: 1 - i * 0.01,
      };
    });
}
