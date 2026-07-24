"use client";

import { useI18n } from "@/lib/i18n";
import { Button, SelectCard, RadioGroup } from "@/components/ui/primitives";
import { DOMAINS, DOMAIN_ORDER } from "@/lib/domains";
import type { Domain } from "@/lib/db/schema";
import type { OnboardingDraft } from "./OnboardingFlow";

const EXPERIMENTAL_DESIGNS = ["RCT", "队列", "病例对照", "横断面", "体外", "动物实验", "系统综述"];

/**
 * 步骤 3 研究类型 (§6.1)。卡片显示该领域的判据，而非泛泛描述。
 * 选实验科学后追加研究设计选择，以加载对应报告规范清单。
 * 节点类型由领域配置动态驱动，此处不硬编码。
 */
export default function StepResearchType({
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
  const domain = draft.domain;

  function selectDomain(d: Domain) {
    patch({ domain: d, design: d === "experimental" ? draft.design : undefined });
  }

  const needsDesign = domain === "experimental";
  const canNext = !needsDesign || !!draft.design;

  return (
    <div className="space-y-6 rounded-sm border border-border bg-bg-surface p-8">
      <div>
        <h2 className="label-mono text-fg-primary">{t.onboarding.typeTitle}</h2>
        <p className="mt-1 text-xs text-fg-tertiary">{t.onboarding.typeHint}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {DOMAIN_ORDER.map((d) => {
          const schema = DOMAINS[d];
          return (
            <SelectCard
              key={d}
              selected={domain === d}
              onClick={() => selectDomain(d)}
              title={schema.label}
              lines={schema.criteria}
            />
          );
        })}
      </div>

      {needsDesign && (
        <div className="space-y-2 border-t border-border pt-4">
          <span className="label-mono block text-fg-secondary">
            {t.onboarding.designLabel}
          </span>
          <p className="text-xs text-fg-tertiary">{t.onboarding.designHint}</p>
          <RadioGroup
            value={draft.design ?? null}
            onChange={(v) => patch({ design: v })}
            options={EXPERIMENTAL_DESIGNS.map((x) => ({ value: x, label: x }))}
          />
          {draft.design &&
            DOMAINS.experimental.checklistBinding?.[draft.design] && (
              <p className="text-xs text-fg-secondary">
                → 将加载清单：
                {DOMAINS.experimental.checklistBinding[draft.design]}
              </p>
            )}
        </div>
      )}

      <div className="flex justify-between">
        <Button onClick={onBack}>{t.common.back}</Button>
        <Button variant="primary" onClick={onNext} disabled={!canNext}>
          {t.common.next}
        </Button>
      </div>
    </div>
  );
}
