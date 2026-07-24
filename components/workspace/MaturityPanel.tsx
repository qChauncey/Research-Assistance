"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import {
  computeMaturity,
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
