import { NextRequest, NextResponse } from "next/server";
import { runSearch } from "@/lib/search";
import type { SearchRequest, SearchSource } from "@/lib/search/types";

/**
 * 文献检索 API（Phase 2，§1.1 短任务 <10s）。
 * 服务端调用 OpenAlex / arXiv，避免浏览器 CORS，并集中限流/缓存的接入点。
 * 无需任何 key。
 */
export const runtime = "nodejs";
export const maxDuration = 15;

export async function POST(req: NextRequest) {
  let body: SearchRequest;
  try {
    body = (await req.json()) as SearchRequest;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const query = (body.query ?? "").trim();
  if (!query) {
    return NextResponse.json({ error: "query required" }, { status: 400 });
  }

  const sources: SearchSource[] =
    body.sources && body.sources.length ? body.sources : ["openalex", "arxiv"];
  const perSource = Math.min(Math.max(body.perSource ?? 10, 1), 25);

  const result = await runSearch(query, sources, perSource);
  return NextResponse.json(result);
}
