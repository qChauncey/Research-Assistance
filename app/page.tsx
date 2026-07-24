"use client";

import { useEffect } from "react";
import { useAppStore } from "@/lib/store";
import { I18nProvider, resolveLocale } from "@/lib/i18n";
import OnboardingFlow from "@/components/onboarding/OnboardingFlow";
import Workspace from "@/components/workspace/Workspace";

/**
 * 根路由：init 后按 onboarded 决定进四步引导还是三栏工作区。
 * 全应用客户端渲染（离线优先，状态在 IndexedDB）。
 */
export default function Home() {
  const ready = useAppStore((s) => s.ready);
  const onboarded = useAppStore((s) => s.onboarded);
  const language = useAppStore((s) => s.language);
  const init = useAppStore((s) => s.init);

  useEffect(() => {
    init();
  }, [init]);

  // 引导前 language 为空，默认中文界面（产品中文优先）；已引导则用用户所选。
  const locale = resolveLocale(language?.ui ?? "zh-CN");

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center bg-bg-void">
        <div className="label-mono text-fg-tertiary">INITIALIZING…</div>
      </div>
    );
  }

  return (
    <I18nProvider locale={locale}>
      {onboarded ? <Workspace /> : <OnboardingFlow />}
    </I18nProvider>
  );
}
