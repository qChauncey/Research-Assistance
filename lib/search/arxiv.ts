import { XMLParser } from "fast-xml-parser";
import type { SearchResult } from "./types";

/**
 * arXiv 客户端（服务端调用，无需 key）。
 * arXiv API 返回 Atom XML；用 fast-xml-parser 解析。arXiv 全文 PDF 恒为开放渠道。
 */
const BASE = "http://export.arxiv.org/api/query";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
});

interface ArxivEntry {
  id?: string;
  title?: string;
  summary?: string;
  published?: string;
  author?: { name?: string } | { name?: string }[];
  link?: { "@_href"?: string; "@_title"?: string; "@_type"?: string }[];
  "arxiv:doi"?: string;
}

function asArray<T>(x: T | T[] | undefined): T[] {
  if (x === undefined) return [];
  return Array.isArray(x) ? x : [x];
}

function arxivIdFromUrl(url?: string): string | undefined {
  if (!url) return undefined;
  // "http://arxiv.org/abs/2104.09112v1" → "2104.09112"
  const m = url.match(/abs\/([^v]+)(v\d+)?$/);
  return m ? m[1] : url.split("/").pop();
}

export async function searchArxiv(
  query: string,
  maxResults = 10,
): Promise<SearchResult[]> {
  const url = new URL(BASE);
  url.searchParams.set("search_query", `all:${query}`);
  url.searchParams.set("start", "0");
  url.searchParams.set("max_results", String(maxResults));
  url.searchParams.set("sortBy", "relevance");

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": "ArgumentTree/1.0" },
    signal: AbortSignal.timeout(9000),
  });
  if (!res.ok) throw new Error(`arXiv ${res.status}`);
  const xml = await res.text();
  const parsed = parser.parse(xml) as {
    feed?: { entry?: ArxivEntry | ArxivEntry[] };
  };

  const entries = asArray(parsed.feed?.entry);
  return entries.map((e, i): SearchResult => {
    const links = asArray(e.link);
    const pdf = links.find((l) => l["@_title"] === "pdf")?.["@_href"];
    const abs = arxivIdFromUrl(e.id);
    const summary = (e.summary ?? "").trim().replace(/\s+/g, " ");
    return {
      source: "arxiv",
      title: (e.title ?? "(untitled)").trim().replace(/\s+/g, " "),
      authors: asArray(e.author)
        .map((a) => a?.name)
        .filter((x): x is string => !!x),
      year: e.published ? new Date(e.published).getFullYear() : undefined,
      venue: "arXiv",
      doi: e["arxiv:doi"],
      arxiv_id: abs,
      abstract: summary.length > 1200 ? summary.slice(0, 1200) + "…" : summary,
      url: e.id,
      oa_pdf_url: pdf ?? (abs ? `https://arxiv.org/pdf/${abs}` : undefined),
      score: 1 - i * 0.01,
    };
  });
}
