"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import type { Candidate } from "@/lib/db/schema";

/**
 * 候选区抽屉（§6.7）—— 右栏底部。约束四：AI 产出永不自动入树；判死/采纳才生效。
 * 每张候选卡片必须显示「我为什么可能是错的」，不可折叠。
 * 采纳：counter_evidence → 挂为反证据；direction/route_diff/建节点 → 入树为节点。
 */
export default function CandidatesDrawer() {
  const { t } = useI18n();
  const allCandidates = useAppStore((s) => s.candidates);
  const acceptCandidate = useAppStore((s) => s.acceptCandidate);
  const rejectCandidate = useAppStore((s) => s.rejectCandidate);
  const nodes = useAppStore((s) => s.nodes);
  const candidates = useMemo(
    () => allCandidates.filter((c) => c.verdict === "pending"),
    [allCandidates],
  );
  const [open, setOpen] = useState(true);

  const kindLabel: Record<Candidate["kind"], string> = {
    counter_evidence: "反证据 / 红队",
    direction: "方向 / 节点草案",
    route_diff: "路线对比",
    connection: "连接点",
  };

  return (
    <div className="border-t border-border bg-bg-surface">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2"
      >
        <span className="label-mono text-fg-secondary">
          {open ? "▾" : "▸"} {t.tree.candidates}
        </span>
        <span className="label-mono text-fg-tertiary">
          {t.tree.pendingCount(candidates.length)}
        </span>
      </button>

      {open && (
        <div className="max-h-64 space-y-2 overflow-y-auto px-3 pb-3">
          {candidates.length === 0 ? (
            <div className="rounded-sm border border-dashed border-border p-4 text-center">
              <p className="text-xs leading-relaxed text-fg-tertiary">
                所有 AI 产出都先进入这里（隔离缓冲），必须由你判死或采纳，永不自动入树。
                <br />
                用中栏对话框的 ⚔红队 / ✦发散 / ⇄对比 / ⊕建节点 生成候选。
              </p>
            </div>
          ) : (
            candidates.map((c) => {
              const content = (c.content ?? {}) as Record<string, unknown>;
              const target = nodes.find((n) => n.id === c.target_node_id);
              const body =
                str(content.claim) ||
                str(content.content) ||
                str(content.issue) ||
                summarizeRouteDiff(content) ||
                "（无内容）";
              const isContra = c.kind === "counter_evidence";
              return (
                <div
                  key={c.id}
                  className={`rounded-sm border p-3 ${
                    isContra ? "border-contradict/40 bg-contradict/5" : "border-border bg-bg-void"
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span
                      className={`label-mono ${isContra ? "text-contradict" : "text-fg-tertiary"}`}
                    >
                      {kindLabel[c.kind]}
                    </span>
                    {target && (
                      <span className="label-mono text-fg-tertiary">
                        → {target.claim.slice(0, 16) || "节点"}
                      </span>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap text-xs text-fg-primary">{body}</p>
                  {c.self_critique && (
                    <p className="mt-2 text-xs text-fg-secondary">
                      我为什么可能是错的：{c.self_critique}
                    </p>
                  )}
                  <div className="mt-2 flex justify-end gap-2">
                    <button
                      onClick={() => acceptCandidate(c.id)}
                      className="label-mono rounded-sm border border-border px-2 py-0.5 text-fg-secondary hover:bg-bg-hover hover:text-fg-primary"
                    >
                      {t.tree.accept}
                    </button>
                    <button
                      onClick={() => rejectCandidate(c.id)}
                      className="label-mono rounded-sm border border-contradict/50 px-2 py-0.5 text-contradict hover:bg-contradict/10"
                    >
                      {t.tree.reject}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : "";
}

function summarizeRouteDiff(content: Record<string, unknown>): string {
  const div = content.divergent;
  if (Array.isArray(div) && div.length) return `分歧点：${div.join("；")}`;
  const shared = content.shared;
  if (Array.isArray(shared) && shared.length) return `共同假设：${shared.join("；")}`;
  if (typeof content.raw === "string") return content.raw as string;
  return "";
}
