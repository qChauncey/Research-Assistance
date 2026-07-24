"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import type { ApiConfig, Domain, LanguageConfig } from "@/lib/db/schema";
import StepLogin from "./StepLogin";
import StepApiConfig from "./StepApiConfig";
import StepResearchType from "./StepResearchType";
import StepLanguage from "./StepLanguage";

/**
 * 四步引导 (§6.1)：登录/离线 → API 配置 → 研究类型 → 语言 → 生成配置进入工作区。
 * 无进度条以外的装饰。
 */
export interface OnboardingDraft {
  userId: string | null;
  userEmail: string | null;
  apiConfig: ApiConfig;
  domain: Domain;
  design?: string;
  language: LanguageConfig;
  projectTitle: string;
}

const defaultDraft: OnboardingDraft = {
  userId: null,
  userEmail: null,
  apiConfig: { provider: null, apiKey: "", storage: "local", tested: false },
  domain: "general",
  design: undefined,
  language: { ui: "zh-CN", search: "en" },
  projectTitle: "",
};

export default function OnboardingFlow() {
  const { t } = useI18n();
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<OnboardingDraft>(defaultDraft);
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);

  function patch(p: Partial<OnboardingDraft>) {
    setDraft((d) => ({ ...d, ...p }));
  }

  async function finish() {
    await completeOnboarding({
      apiConfig: draft.apiConfig,
      language: draft.language,
      domain: draft.domain,
      design: draft.design,
      projectTitle: draft.projectTitle,
      userId: draft.userId,
      userEmail: draft.userEmail,
    });
  }

  return (
    <div className="flex h-full items-center justify-center bg-bg-void p-6">
      <div className="w-full max-w-xl">
        {step > 1 && (
          <div className="mb-6 flex items-center justify-between">
            <span className="label-mono text-fg-tertiary">{`${step} / 4`}</span>
            <div className="flex gap-1">
              {[1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className={`h-px w-8 ${i <= step ? "bg-fg-primary" : "bg-border"}`}
                />
              ))}
            </div>
          </div>
        )}

        {step === 1 && (
          <StepLogin
            draft={draft}
            patch={patch}
            onNext={() => setStep(2)}
          />
        )}
        {step === 2 && (
          <StepApiConfig
            draft={draft}
            patch={patch}
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
          />
        )}
        {step === 3 && (
          <StepResearchType
            draft={draft}
            patch={patch}
            onBack={() => setStep(2)}
            onNext={() => setStep(4)}
          />
        )}
        {step === 4 && (
          <StepLanguage
            draft={draft}
            patch={patch}
            onBack={() => setStep(3)}
            onFinish={finish}
          />
        )}

        <p className="mt-8 text-center text-xs text-fg-tertiary">{t.tagline}</p>
      </div>
    </div>
  );
}
