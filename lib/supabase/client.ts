"use client";

/**
 * Supabase 浏览器客户端。
 * 只用 NEXT_PUBLIC_ 前缀的公开变量（URL + anon key）；service role 等密钥仅服务端可用，
 * 绝不出现在此文件（见技术文档"技术栈与部署"的环境变量说明）。
 *
 * 若未配置环境变量，返回 null——应用回落到纯离线模式，不报错。
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null | undefined;

export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    client = null;
    return client;
  }
  client = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  return client;
}

/** 是否配置了 Supabase（决定 UI 是否显示云端登录入口）。 */
export function isSupabaseConfigured(): boolean {
  return (
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
