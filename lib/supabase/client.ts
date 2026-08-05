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

/** 重置密码邮件的回跳地址（必须在 Supabase 后台 Redirect URLs 里放行）。 */
export function resetRedirectUrl(): string {
  return `${window.location.origin}/reset-password`;
}

/**
 * 发送重置密码验证邮件。
 * 安全性：无论邮箱是否注册，Supabase 都返回成功——不泄露账号是否存在（防枚举），
 * 因此 UI 一律提示"已发送，请查收"，不区分。
 */
export async function sendPasswordReset(email: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("未配置云端，无法重置密码");
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: resetRedirectUrl(),
  });
  if (error) throw error;
}

/** 用恢复会话设置新密码（用户已通过邮件链接回到应用）。 */
export async function updatePassword(newPassword: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("未配置云端");
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}
