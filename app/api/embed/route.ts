import { NextRequest, NextResponse } from "next/server";

/**
 * 嵌入薄转发代理（Phase 2, §1.1 方案 A）。
 * 请求经我们的 Edge/Node Function 转发到 OpenAI embeddings，**不落盘、不记录 body**。
 * key 由客户端每次请求携带（BYOK），服务端用完即弃，绝不持久化。
 *
 * 维度 1536 对应 text-embedding-3-small（§2.1）。无 key 时前端应降级为关键词检索，
 * 不应调用本路由。
 */
export const runtime = "nodejs";
export const maxDuration = 20;

interface EmbedRequest {
  input: string | string[];
  apiKey: string;
  model?: string;
}

export async function POST(req: NextRequest) {
  let body: EmbedRequest;
  try {
    body = (await req.json()) as EmbedRequest;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.apiKey) {
    return NextResponse.json({ error: "缺少 API key（BYOK）" }, { status: 400 });
  }
  if (!body.input || (Array.isArray(body.input) && body.input.length === 0)) {
    return NextResponse.json({ error: "input required" }, { status: 400 });
  }

  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${body.apiKey}`,
      },
      body: JSON.stringify({
        input: body.input,
        model: body.model ?? "text-embedding-3-small",
      }),
      signal: AbortSignal.timeout(18000),
    });
    if (!res.ok) {
      const detail = await res.text();
      return NextResponse.json(
        { error: `embedding provider ${res.status}`, detail: detail.slice(0, 300) },
        { status: 502 },
      );
    }
    const data = (await res.json()) as {
      data: { embedding: number[] }[];
    };
    // 只回传向量，不记录任何输入内容
    return NextResponse.json({ embeddings: data.data.map((d) => d.embedding) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
