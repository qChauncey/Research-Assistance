"use client";

/**
 * 客户端 AI 调用封装。读取已配置的 BYOK config，POST 到 /api/llm/chat。
 * 无 key 或无模型时抛出可读错误，UI 负责提示去配置。
 */
import type { ApiConfig } from "@/lib/db/schema";
import type { ChatMessage } from "./chat";

export class NotConfiguredError extends Error {}

export async function chat(
  cfg: ApiConfig | null,
  opts: { system?: string; messages: ChatMessage[]; maxTokens?: number },
): Promise<string> {
  if (!cfg || !cfg.provider || !cfg.model) {
    throw new NotConfiguredError("未配置模型：请在设置里选择服务商与模型并填 API key。");
  }
  if (!cfg.apiKey) {
    throw new NotConfiguredError("缺少 API key：请在设置里填写。");
  }
  const res = await fetch("/api/llm/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: cfg.provider,
      apiKey: cfg.apiKey,
      baseUrl: cfg.baseUrl,
      model: cfg.model,
      system: opts.system,
      messages: opts.messages,
      maxTokens: opts.maxTokens,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `调用失败 ${res.status}`);
  return data.text as string;
}

/** 从模型返回里稳健地抽取 JSON（去代码围栏、取第一个平衡的 {...}）。 */
export function extractJSON<T = unknown>(text: string): T | null {
  if (!text) return null;
  // 去掉 ```json ... ``` 围栏
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  if (start < 0) return null;
  // 平衡括号扫描
  let depth = 0;
  for (let i = start; i < body.length; i++) {
    const c = body[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(body.slice(start, i + 1)) as T;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}
