"use client";

import { useEffect, useState } from "react";
import { useI18n, I18nProvider, resolveLocale } from "@/lib/i18n";
import { Button, Input, Field } from "@/components/ui/primitives";
import {
  getSupabase,
  isSupabaseConfigured,
  updatePassword,
} from "@/lib/supabase/client";
import { useAppStore } from "@/lib/store";

/**
 * 重置密码回跳页（邮箱验证链接的落地页）。
 *
 * 两种链路都要接住：
 *  - implicit：链接带 #access_token=…&type=recovery，supabase-js 的 detectSessionInUrl
 *    会自动解析并触发 PASSWORD_RECOVERY 事件；
 *  - PKCE：链接带 ?code=…，需手动 exchangeCodeForSession。
 * 拿到恢复会话后才允许设置新密码；没有会话说明链接无效/过期。
 */
export default function ResetPasswordPage() {
  const language = useAppStore((s) => s.language);
  const theme = useAppStore((s) => s.theme);
  const init = useAppStore((s) => s.init);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <I18nProvider locale={resolveLocale(language?.ui ?? "zh-CN")}>
      <ResetPasswordInner />
    </I18nProvider>
  );
}

type Phase = "verifying" | "ready" | "invalid" | "done";

function ResetPasswordInner() {
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>("verifying");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = getSupabase();
    if (!supabase) {
      setPhase("invalid");
      return;
    }

    // 恢复会话到达（implicit 链路由 detectSessionInUrl 解析后触发）
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY" || (session && event === "SIGNED_IN")) {
        setPhase("ready");
      }
    });

    (async () => {
      try {
        // PKCE 链路：?code=… 需手动交换
        const code = new URLSearchParams(window.location.search).get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }
        // 链接里带的错误（过期/已使用）会以 hash 形式回传
        const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        if (hash.get("error") || hash.get("error_description")) {
          if (!cancelled) setPhase("invalid");
          return;
        }
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        setPhase(data.session ? "ready" : "invalid");
      } catch {
        if (!cancelled) setPhase("invalid");
      }
    })();

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function submit() {
    setError(null);
    if (pw.length < 6) {
      setError(t.onboarding.passwordTooShort);
      return;
    }
    if (pw !== pw2) {
      setError(t.onboarding.passwordMismatch);
      return;
    }
    setBusy(true);
    try {
      await updatePassword(pw);
      setPhase("done");
      // 密码已更新且已登录，回主界面
      setTimeout(() => {
        window.location.href = "/";
      }, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-bg-void p-6">
      <div className="w-full max-w-sm space-y-6 rounded-sm border border-border bg-bg-surface p-8">
        <div>
          <h1 className="label-mono text-lg tracking-label text-fg-primary">
            {t.onboarding.resetTitle}
          </h1>
        </div>

        {phase === "verifying" && (
          <p className="label-mono text-fg-tertiary">
            {t.onboarding.verifyingLink}
          </p>
        )}

        {phase === "invalid" && (
          <div className="space-y-4">
            <p className="text-xs text-contradict">
              {isSupabaseConfigured()
                ? t.onboarding.resetLinkInvalid
                : "云端未配置，无法重置密码。"}
            </p>
            <Button className="w-full" onClick={() => (window.location.href = "/")}>
              {t.onboarding.backToLogin}
            </Button>
          </div>
        )}

        {phase === "ready" && (
          <div className="space-y-4">
            <Field label={t.onboarding.newPassword}>
              <Input
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                autoComplete="new-password"
              />
            </Field>
            <Field label={t.onboarding.confirmPassword}>
              <Input
                type="password"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                autoComplete="new-password"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) submit();
                }}
              />
            </Field>
            {error && <p className="text-xs text-contradict">{error}</p>}
            <Button
              variant="primary"
              className="w-full"
              disabled={busy || !pw || !pw2}
              onClick={submit}
            >
              {t.onboarding.updatePassword}
            </Button>
          </div>
        )}

        {phase === "done" && (
          <p className="text-xs text-fg-secondary">{t.onboarding.resetDone}</p>
        )}
      </div>
    </div>
  );
}
