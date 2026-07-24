"use client";

import { useState } from "react";
import {
  useI18n,
  UI_LANGUAGE_CHOICES,
  SEARCH_LANGUAGE_CHOICES,
} from "@/lib/i18n";
import { Button, Input, Field, RadioGroup } from "@/components/ui/primitives";
import type { OnboardingDraft } from "./OnboardingFlow";

/**
 * 步骤 4 语言 (§6.1)。一次选择同时决定界面/AI输出/论文草稿三件事；
 * 检索语言是独立字段（中文界面 + 英文检索最常见，不绑死）。
 * 顺带填项目名。完成后生成配置进入工作区。
 */
export default function StepLanguage({
  draft,
  patch,
  onBack,
  onFinish,
}: {
  draft: OnboardingDraft;
  patch: (p: Partial<OnboardingDraft>) => void;
  onBack: () => void;
  onFinish: () => void;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);

  async function finish() {
    setBusy(true);
    await onFinish();
    // 成功后根组件会切到 Workspace，无需手动跳转
  }

  return (
    <div className="space-y-6 rounded-sm border border-border bg-bg-surface p-8">
      <h2 className="label-mono text-fg-primary">{t.onboarding.langTitle}</h2>

      <Field label={t.onboarding.langTitle}>
        <RadioGroup
          value={draft.language.ui}
          onChange={(v) => patch({ language: { ...draft.language, ui: v } })}
          options={UI_LANGUAGE_CHOICES.map((c) => ({ value: c.value, label: c.label }))}
        />
      </Field>

      <div className="rounded-sm border border-border bg-bg-void p-3 text-xs text-fg-tertiary">
        <p className="mb-1 text-fg-secondary">{t.onboarding.langApplies}</p>
        <ul className="space-y-0.5">
          <li>▪ {t.onboarding.langUi}</li>
          <li>▪ {t.onboarding.langAi}</li>
          <li>▪ {t.onboarding.langPaper}</li>
        </ul>
      </div>

      <Field label={t.onboarding.searchLang} hint={t.onboarding.searchLangHint}>
        <RadioGroup
          value={draft.language.search}
          onChange={(v) => patch({ language: { ...draft.language, search: v } })}
          options={SEARCH_LANGUAGE_CHOICES}
        />
      </Field>

      <Field label={t.onboarding.projectTitle}>
        <Input
          value={draft.projectTitle}
          onChange={(e) => patch({ projectTitle: e.target.value })}
          placeholder={t.onboarding.projectTitlePlaceholder}
        />
      </Field>

      <div className="flex justify-between">
        <Button onClick={onBack}>{t.common.back}</Button>
        <Button
          variant="primary"
          onClick={finish}
          disabled={busy || !draft.projectTitle.trim()}
        >
          {t.common.start}
        </Button>
      </div>
    </div>
  );
}
