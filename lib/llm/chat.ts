/**
 * 统一 LLM 调用（服务端，Phase 3 地基）。
 *
 * 一套接口封装两种 API 形态：
 *  - anthropic：POST {base}/v1/messages，头 x-api-key + anthropic-version，取 content[].text
 *  - openai   ：POST {base}/chat/completions，头 Authorization: Bearer，取 choices[0].message.content
 *
 * 只做最小公共子集（model / max_tokens / messages / system），以最大化跨服务商与跨模型版本
 * 的兼容性——不注入 anthropic 专有的 thinking/effort 等参数，避免不同模型版本 400。
 *
 * 遵循 §1.1 方案 A：请求经服务端转发，不落盘、不记录 body。key 每次随请求携带，用完即弃。
 */
import { getProvider, resolveBaseUrl, type ApiStyle } from "@/lib/providers";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatParams {
  provider: string;
  apiKey: string;
  baseUrl?: string;
  model: string;
  system?: string;
  messages: ChatMessage[];
  maxTokens?: number;
}

export interface ChatResult {
  text: string;
  model: string;
  latencyMs: number;
}

function styleOf(provider: string, override?: ApiStyle): ApiStyle {
  return override ?? getProvider(provider)?.apiStyle ?? "openai";
}

export async function callLLM(p: ChatParams): Promise<ChatResult> {
  const base = resolveBaseUrl(p.provider, p.baseUrl);
  if (!base) throw new Error("缺少 Base URL");
  if (!p.model) throw new Error("缺少模型 ID");
  const style = styleOf(p.provider);
  const maxTokens = p.maxTokens ?? 1024;
  const started = Date.now();

  if (style === "anthropic") {
    const res = await fetch(`${base}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": p.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: p.model,
        max_tokens: maxTokens,
        ...(p.system ? { system: p.system } : {}),
        messages: p.messages,
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);
    const data = (await res.json()) as {
      content?: { type: string; text?: string }[];
      model?: string;
    };
    const text = (data.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("");
    return { text, model: data.model ?? p.model, latencyMs: Date.now() - started };
  }

  // openai 兼容
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${p.apiKey}`,
    },
    body: JSON.stringify({
      model: p.model,
      max_tokens: maxTokens,
      messages: [
        ...(p.system ? [{ role: "system", content: p.system }] : []),
        ...p.messages,
      ],
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    model?: string;
  };
  const text = data.choices?.[0]?.message?.content ?? "";
  return { text, model: data.model ?? p.model, latencyMs: Date.now() - started };
}
