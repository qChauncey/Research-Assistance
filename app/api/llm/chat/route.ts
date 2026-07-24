import { NextRequest, NextResponse } from "next/server";
import { callLLM, type ChatMessage } from "@/lib/llm/chat";

/**
 * 对话调用（Phase 3，唯一 AI 入口的服务端，§6.5 / §1.1 方案 A）。
 * 服务端转发到用户配置的服务商，避开浏览器 CORS；不落盘、不记录 body；key 用完即弃。
 */
export const runtime = "nodejs";
export const maxDuration = 60;

interface ChatReq {
  provider: string;
  apiKey: string;
  baseUrl?: string;
  model: string;
  system?: string;
  messages: ChatMessage[];
  maxTokens?: number;
}

export async function POST(req: NextRequest) {
  let body: ChatReq;
  try {
    body = (await req.json()) as ChatReq;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.provider || !body.model) {
    return NextResponse.json({ error: "未配置服务商或模型" }, { status: 400 });
  }
  if (!body.apiKey) {
    return NextResponse.json({ error: "缺少 API key（BYOK，请在设置里配置）" }, { status: 400 });
  }
  if (!body.messages?.length) {
    return NextResponse.json({ error: "messages 为空" }, { status: 400 });
  }

  try {
    const r = await callLLM({
      provider: body.provider,
      apiKey: body.apiKey,
      baseUrl: body.baseUrl,
      model: body.model,
      system: body.system,
      messages: body.messages,
      maxTokens: body.maxTokens ?? 2048,
    });
    return NextResponse.json({ text: r.text, model: r.model, latencyMs: r.latencyMs });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
