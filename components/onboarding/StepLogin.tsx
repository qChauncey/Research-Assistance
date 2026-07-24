"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Button, Input, Field } from "@/components/ui/primitives";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import type { OnboardingDraft } from "./OnboardingFlow";

/**
 * 步骤 1 登录 (§6.1)。
 * 「不登录」路径直通工作区，全部状态存 IndexedDB，必须一等对待。
 * 配置了 Supabase 时，登录/注册走真实 Supabase Auth（用户要求现在就接）。
 */
export default function StepLogin({
  draft,
  patch,
  onNext,
}: {
  draft: OnboardingDraft;
  patch: (p: Partial<OnboardingDraft>) => void;
  onNext: () => void;
}) {
  const { t } = useI18n();
  const [email, setEmail] = useState(draft.userEmail ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const cloudAvailable = isSupabaseConfigured();

  async function auth(mode: "login" | "register") {
    setError(null);
    setInfo(null);
    const supabase = getSupabase();
    if (!supabase) {
      setError("未配置云端，请使用本地模式");
      return;
    }
    setBusy(true);
    try {
      if (mode === "register") {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data.user && !data.session) {
          setInfo("注册成功，请查收邮箱确认后再登录。");
          setBusy(false);
          return;
        }
        patch({ userId: data.user?.id ?? null, userEmail: email });
        onNext();
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        patch({ userId: data.user?.id ?? null, userEmail: email });
        onNext();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function offline() {
    patch({ userId: null, userEmail: null });
    onNext();
  }

  return (
    <div className="space-y-6 rounded-sm border border-border bg-bg-surface p-8">
      <div>
        <h1 className="label-mono text-lg tracking-label text-fg-primary">
          {t.appName}
        </h1>
        <p className="mt-1 text-sm text-fg-secondary">{t.tagline}</p>
      </div>

      {cloudAvailable ? (
        <div className="space-y-4">
          <Field label={t.onboarding.email}>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </Field>
          <Field label={t.onboarding.password}>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </Field>

          {error && <p className="text-xs text-contradict">{error}</p>}
          {info && <p className="text-xs text-fg-secondary">{info}</p>}

          <div className="flex gap-2">
            <Button
              variant="primary"
              className="flex-1"
              disabled={busy || !email || !password}
              onClick={() => auth("login")}
            >
              {t.onboarding.login}
            </Button>
            <Button
              className="flex-1"
              disabled={busy || !email || !password}
              onClick={() => auth("register")}
            >
              {t.onboarding.register}
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-fg-tertiary">
          云端未配置，仅本地模式可用。
        </p>
      )}

      <div className="border-t border-border pt-4">
        <Button className="w-full" onClick={offline}>
          {t.onboarding.offlineEntry}
        </Button>
        <p className="mt-2 text-xs text-fg-tertiary">{t.onboarding.offlineHint}</p>
      </div>
    </div>
  );
}
