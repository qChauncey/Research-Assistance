"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { ArgNode, Domain, Evidence } from "@/lib/db/schema";
import { getNodeTypeDef } from "@/lib/domains";
import { isAssumption, isMissingFalsifier } from "@/lib/methodology";

export interface ArgNodeData extends Record<string, unknown> {
  node: ArgNode;
  domain: Domain;
  typeLabel: string;
  supports: number;
  contradicts: number;
  selected: boolean;
}

/** 五点置信圆（§7.4）：进度条暗示连续精度，圆点诚实表示这是粗略估计。 */
function ConfidenceDots({ value }: { value: number | null }) {
  const filled = value === null ? 0 : Math.round(value * 5);
  return (
    <span className="inline-flex items-center gap-1" title={`conf ${value ?? "?"}`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={`inline-block h-1.5 w-1.5 rounded-full border ${
            i < filled ? "bg-fg-primary border-fg-primary" : "border-fg-tertiary"
          }`}
        />
      ))}
      <span className="label-mono ml-1 text-fg-tertiary">
        {value === null ? "—" : value.toFixed(1)}
      </span>
    </span>
  );
}

function ArgumentNodeInner({ data }: NodeProps) {
  const { node, domain, typeLabel, supports, contradicts, selected } =
    data as ArgNodeData;

  const assumption = isAssumption(node, domain);
  const missingFalsifier = isMissingFalsifier(node, domain);
  const dead = node.status === "dead";
  const conflict = node.status === "conflict_copy";

  // §7.4 视觉编码
  const borderStyle = assumption ? "border-dashed" : "border-solid";
  let borderColor = "border-border";
  if (selected) borderColor = "border-border-focus";
  else if (conflict) borderColor = "border-contradict";
  else if (contradicts > 0) borderColor = "border-fg-secondary";

  return (
    <div
      className={`w-[240px] rounded-sm border bg-bg-raised px-3 py-2 ${borderStyle} ${borderColor} ${
        dead ? "opacity-60" : ""
      }`}
      style={{ minHeight: 90 }}
    >
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />

      {/* 类型标签行 —— 假设全大写 + 虚线已在容器体现 */}
      <div className="mb-1 flex items-center justify-between">
        <span className="label-mono text-fg-tertiary">{typeLabel}</span>
        {missingFalsifier && (
          <span
            className="text-contradict"
            title="缺证伪条件（经验节点必填）"
          >
            ⚠
          </span>
        )}
      </div>

      {/* 命题 —— Inter 正文；已证伪加删除线 + 全灰 */}
      <p
        className={`font-sans text-[13px] leading-snug ${
          dead ? "text-dead line-through" : "text-fg-primary"
        }`}
      >
        {node.claim || "（空命题）"}
      </p>

      {/* 置信度 + 证据计数 */}
      <div className="mt-2 flex items-center justify-between">
        <ConfidenceDots value={node.confidence} />
        <div className="flex items-center gap-2">
          {supports > 0 && (
            <span className="label-mono text-fg-tertiary" title="supports">
              ▪ {supports}
            </span>
          )}
          {contradicts > 0 && (
            <span
              className="label-mono flex items-center gap-1 text-contradict"
              title="contradicts —— 反证据永远可见"
            >
              {contradicts}
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-contradict" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function nodeEvidenceCounts(evidence: Evidence[], nodeId: string) {
  let supports = 0;
  let contradicts = 0;
  for (const e of evidence) {
    if (e.node_id !== nodeId) continue;
    if (e.stance === "supports") supports++;
    else if (e.stance === "contradicts") contradicts++;
  }
  return { supports, contradicts };
}

export function makeTypeLabel(domain: Domain, nodeType: string): string {
  return getNodeTypeDef(domain, nodeType)?.label ?? nodeType;
}

export default memo(ArgumentNodeInner);
