import { NextRequest, NextResponse } from "next/server";
import { callLLM } from "@/lib/llm/chat";

/**
 * 测试连接（§6.1 步骤 2：必须真实发一次最小请求，不能只校验格式）。
 * 服务端转发，避开浏览器 CORS（Anthropic/OpenAI 官方 API 不允许浏览器直连，§1.1）。
 * 不落盘、不记录 body；key 仅本次请求使用。
 */
export const runtime = "nodejs";
export const maxDuration = 35;

interface TestReq {
  provider: string;
  apiKey: string;
  baseUrl?: string;
  model: string;
}

export async function POST(req: NextRequest) {
  let body: TestReq;
  try {
    body = (await req.json()) as TestReq;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  if (!body.provider || !body.model) {
    return NextResponse.json(
      { ok: false, error: "缺少服务商或模型" },
      { status: 400 },
    );
  }

  try {
    const r = await callLLM({
      provider: body.provider,
      apiKey: body.apiKey,
      baseUrl: body.baseUrl,
      model: body.model,
      messages: [{ role: "user", content: "ping" }],
      maxTokens: 4,
    });
    return NextResponse.json({ ok: true, latencyMs: r.latencyMs, model: r.model });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
