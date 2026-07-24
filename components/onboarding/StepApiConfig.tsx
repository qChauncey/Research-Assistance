"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Button, Input, Field, RadioGroup } from "@/components/ui/primitives";
import type { ApiConfig } from "@/lib/db/schema";
import type { OnboardingDraft } from "./OnboardingFlow";

/**
 * 步骤 2 配置 API (§6.1)。BYOK。
 * Phase 1：只存不用（约束四相关：LLM 调用在 Phase 3）。「测试连接」在 Phase 1 显示占位。
 * Key 默认只存本设备浏览器。
 */
export default function StepApiConfig({
  draft,
  patch,
  onBack,
  onNext,
}: {
  draft: OnboardingDraft;
  patch: (p: Partial<OnboardingDraft>) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const { t } = useI18n();
  const cfg = draft.apiConfig;
  const [local, setLocal] = useState<ApiConfig>(cfg);

  function update(p: Partial<ApiConfig>) {
    const next = { ...local, ...p };
    setLocal(next);
    patch({ apiConfig: next });
  }

  return (
    <div className="space-y-6 rounded-sm border border-border bg-bg-surface p-8">
      <h2 className="label-mono text-fg-primary">{t.onboarding.apiTitle}</h2>

      <Field label={t.onboarding.apiProvider}>
        <RadioGroup
          value={local.provider}
          onChange={(v) => update({ provider: v })}
          options={[
            { value: "anthropic", label: "Anthropic" },
            { value: "openai", label: "OpenAI" },
            { value: "compatible", label: "兼容端点" },
          ]}
        />
      </Field>

      <Field label={t.onboarding.apiKey}>
        <Input
          type="password"
          value={local.apiKey}
          onChange={(e) => update({ apiKey: e.target.value })}
          placeholder="sk-ant-•••••••••••••••••••••••"
        />
      </Field>

      <Field label={t.onboarding.apiStorage}>
        <RadioGroup
          value={local.storage}
          onChange={(v) => update({ storage: v })}
          options={[
            { value: "local", label: t.onboarding.storageLocal },
            { value: "encrypted_sync", label: t.onboarding.storageSync },
          ]}
        />
      </Field>

      <div className="flex items-center gap-3">
        <Button disabled title={t.onboarding.apiPhaseNote}>
          {t.onboarding.testConnection}
        </Button>
        <span className="text-xs text-fg-tertiary">{t.onboarding.apiPhaseNote}</span>
      </div>

      <div className="space-y-1 border-t border-border pt-4">
        <span className="label-mono block text-fg-secondary">
          {t.onboarding.litSearch}
        </span>
        <p className="text-xs text-fg-tertiary">✓ OpenAlex · ✓ arXiv （Phase 2 接入）</p>
      </div>

      <div className="flex justify-between">
        <Button onClick={onBack}>{t.common.back}</Button>
        <Button variant="primary" onClick={onNext}>
          {t.common.next}
        </Button>
      </div>
    </div>
  );
}
