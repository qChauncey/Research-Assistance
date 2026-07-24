"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import {
  computeMaturity,
  computeMethodologyHealth,
  isLowContradictionCoverage,
} from "@/lib/methodology";
import type { Domain } from "@/lib/db/schema";

/**
 * 成熟度诚实指标（§5.2 G）—— 常驻，不可关闭。
 * 对抗"整齐 = 正确"的错觉。指标只衡量"审查是否发生"，不惩罚诚实标注本身（A.5.2）。
 * 紧凑条永远可见，点击展开完整指标。
 */
export default function MaturityPanel() {
  const { t } = useI18n();
  const nodes = useAppStore((s) => s.nodes);
  const evidence = useAppStore((s) => s.evidence);
  const project = useAppStore((s) => s.project);
  const selectNode = useAppStore((s) => s.selectNode);
  const [expanded, setExpanded] = useState(false);

  const domain = (project?.domain ?? "general") as Domain;
  const m = useMemo(
    () => computeMaturity(nodes, evidence, domain),
    [nodes, evidence, domain],
  );
  const h = useMemo(
    () => computeMethodologyHealth(nodes, domain),
    [nodes, domain],
  );
  const lowCoverage = isLowContradictionCoverage(m);

  return (
    <div className="border-b border-border bg-bg-surface">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center gap-3 px-3 py-2"
      >
        <span className="label-mono text-fg-secondary">
          {expanded ? "▾" : "▸"} {t.maturity.title}
        </span>
        <span className="label-mono text-fg-tertiary">
          {t.maturity.nodeTotal} {m.nodeCount}
        </span>
        {m.unreviewedAssumptions.count > 0 && (
          <span className="label-mono text-fg-tertiary">
            ⚠ {m.unreviewedAssumptions.count}/{m.unreviewedAssumptions.totalAssumptions}
          </span>
        )}
        {lowCoverage && (
          <span className="label-mono text-contradict">
            {t.maturity.contradicted} {m.contradictedNodes.count}/
            {m.contradictedNodes.total}
          </span>
        )}
      </button>

      {expanded && (
        <div className="space-y-2 px-3 pb-3 font-mono text-[11px]">
          <Row
            label={t.maturity.nodeTotal}
            value={String(m.nodeCount)}
          />
          <Row
            label={t.maturity.unreviewedAssumptions}
            value={`${m.unreviewedAssumptions.count} / ${m.unreviewedAssumptions.totalAssumptions}`}
            hint={t.maturity.unreviewedHint}
          />
          <Row label={t.maturity.noEvidence} value={String(m.noEvidenceNodes)} />
          <Row
            label={t.maturity.contradicted}
            value={`${m.contradictedNodes.count} / ${m.contradictedNodes.total}`}
            warn={lowCoverage}
            hint={lowCoverage ? t.maturity.lowCoverageHint : undefined}
          />
          <Row
            label={t.maturity.unfalsifiable}
            value={`${m.unfalsifiable.count} / ${m.unfalsifiable.empiricalTotal}`}
            hint="分母只计经验节点（A.5.2）"
          />
          <Row
            label={t.maturity.oldest}
            value={`${m.oldestUnreviewedDays} ${t.maturity.days}`}
          />

          {/* —— 方法论健康度全表（§5.2 G 下半 / A.5.2） —— */}
          <div className="mt-2 border-t border-border pt-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-fg-secondary">{t.maturity.healthTitle}</span>
              <span className={h.score >= 80 ? "text-fg-primary" : "text-fg-secondary"}>
                {h.score}%
              </span>
            </div>
            {h.score >= 80 && (
              <p className="mb-1 text-fg-tertiary">
                「全绿只意味着报告完整，不意味着研究重要——该找人评审了」
              </p>
            )}
            <Row
              label="不可证伪节点"
              value={`${h.unfalsifiable.count} / ${h.unfalsifiable.empiricalTotal}`}
            />
            <Row label="单一假设节点" value={String(h.singleHypothesis)} />
            {domain === "social" && (
              <Row label="未论证的识别假设" value={String(h.unjustifiedIdentification)} />
            )}
            {domain === "physics" && (
              <Row label="越界使用的近似" value={String(h.approxOutOfRange)} />
            )}
            {domain === "experimental" && (
              <Row label="未验证的外推跨越" value={String(h.extrapolationGaps)} />
            )}
            <Row
              label="退化纲领信号"
              value={`${h.degeneratingProgram} 处`}
              hint={h.degeneratingProgram > 0 ? "保护带修订多于新预测（Lakatos）" : undefined}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  hint,
  warn,
}: {
  label: string;
  value: string;
  hint?: string;
  warn?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-fg-secondary">{label}</span>
        <span className={warn ? "text-contradict" : "text-fg-primary"}>
          {value}
        </span>
      </div>
      {hint && <p className="text-fg-tertiary">「{hint}」</p>}
    </div>
  );
}
