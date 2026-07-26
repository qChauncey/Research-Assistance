import type { SearchResult } from "./types";

/**
 * OpenAlex 客户端（服务端调用，无需 key）。
 * OpenAlex 优先：免费、无严格限流、覆盖最广（§1.2）。
 * 加 mailto 进入 polite pool（OpenAlex 推荐做法，提升配额稳定性）。
 */
const BASE = "https://api.openalex.org/works";
const MAILTO = "argument-tree@example.org";

interface OAAuthorship {
  author?: { display_name?: string };
}
interface OALocation {
  pdf_url?: string;
  landing_page_url?: string;
  source?: { display_name?: string };
}
interface OAWork {
  id?: string;
  doi?: string;
  title?: string;
  display_name?: string;
  type?: string;
  publication_year?: number;
  cited_by_count?: number;
  relevance_score?: number;
  is_retracted?: boolean;
  authorships?: OAAuthorship[];
  primary_location?: OALocation;
  best_oa_location?: OALocation;
  abstract_inverted_index?: Record<string, number[]>;
}

/** OpenAlex 摘要用倒排索引存储，还原成文本。 */
function decodeAbstract(inv?: Record<string, number[]>): string | undefined {
  if (!inv) return undefined;
  const positions: [number, string][] = [];
  for (const [word, idxs] of Object.entries(inv)) {
    for (const i of idxs) positions.push([i, word]);
  }
  positions.sort((a, b) => a[0] - b[0]);
  const text = positions.map((p) => p[1]).join(" ");
  return text.length > 1200 ? text.slice(0, 1200) + "…" : text;
}

function shortId(fullId?: string): string | undefined {
  if (!fullId) return undefined;
  // "https://openalex.org/W123" → "W123"
  return fullId.split("/").pop();
}

function cleanDoi(doi?: string): string | undefined {
  if (!doi) return undefined;
  return doi.replace(/^https?:\/\/doi\.org\//, "");
}

export async function searchOpenAlex(
  query: string,
  perPage = 10,
): Promise<SearchResult[]> {
  const url = new URL(BASE);
  url.searchParams.set("search", query);
  url.searchParams.set("per-page", String(perPage));
  url.searchParams.set("mailto", MAILTO);
  // 质量过滤：剔除副文本（书评/勘误等噪声）与已撤稿论文（issue 4：低质结果下沉）
  url.searchParams.set("filter", "is_paratext:false,is_retracted:false");

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": `ArgumentTree/1.0 (mailto:${MAILTO})` },
    // 服务端调用，短任务
    signal: AbortSignal.timeout(9000),
  });
  if (!res.ok) throw new Error(`OpenAlex ${res.status}`);
  const data = (await res.json()) as { results?: OAWork[] };

  const works = data.results ?? [];
  // OpenAlex 用 search 时返回 relevance_score（真实相关度）；批内归一化到 0..1，用于跨源排序。
  const maxRel = Math.max(1e-6, ...works.map((w) => w.relevance_score ?? 0));
  return works.map((w, i): SearchResult => {
    const oa = w.best_oa_location ?? w.primary_location;
    const rel = w.relevance_score != null ? w.relevance_score / maxRel : 1 - i * 0.01;
    return {
      source: "openalex",
      title: w.title ?? w.display_name ?? "(untitled)",
      authors: (w.authorships ?? [])
        .map((a) => a.author?.display_name)
        .filter((x): x is string => !!x),
      year: w.publication_year,
      venue: w.primary_location?.source?.display_name,
      doi: cleanDoi(w.doi),
      openalex_id: shortId(w.id),
      cited_by: w.cited_by_count,
      abstract: decodeAbstract(w.abstract_inverted_index),
      url:
        w.primary_location?.landing_page_url ??
        (w.doi ? `https://doi.org/${cleanDoi(w.doi)}` : undefined),
      oa_pdf_url: oa?.pdf_url,
      pub_type: w.type,
      retracted: w.is_retracted,
      score: rel, // 归一化真实相关度
    };
  });
}
