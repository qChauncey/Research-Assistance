"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";

/**
 * 候选区抽屉（§6.7）—— 右栏底部，展开后覆盖树的下半部分。
 * 约束四：AI 产出永不自动入树；Phase 1 不接 LLM，但数据结构与 UI 位置必须预留，
 * 不能设计成事后能塞进去的东西。
 */
export default function CandidatesDrawer() {
  const { t } = useI18n();
  const allCandidates = useAppStore((s) => s.candidates);
  const candidates = useMemo(
    () => allCandidates.filter((c) => c.verdict === "pending"),
    [allCandidates],
  );
  const [open, setOpen] = useState(false);

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
        <div className="max-h-56 space-y-2 overflow-y-auto px-3 pb-3">
          {candidates.length === 0 ? (
            <div className="rounded-sm border border-dashed border-border p-4 text-center">
              <p className="text-xs leading-relaxed text-fg-tertiary">
                所有 AI 产出都会先进入这里（隔离缓冲），必须由你判死或采纳，永不自动入树。
                <br />
                <span className="text-fg-secondary">{t.workspace.phase3Note}</span>
              </p>
            </div>
          ) : (
            candidates.map((c) => (
              <div
                key={c.id}
                className="rounded-sm border border-border bg-bg-void p-3"
              >
                <div className="label-mono mb-1 text-fg-tertiary">{c.kind}</div>
                <p className="text-xs text-fg-primary">
                  {JSON.stringify(c.content)}
                </p>
                {c.self_critique && (
                  <p className="mt-2 text-xs text-fg-secondary">
                    我为什么可能是错的：{c.self_critique}
                  </p>
                )}
                <div className="mt-2 flex justify-end gap-2">
                  <button className="label-mono text-fg-tertiary hover:text-fg-primary">
                    {t.tree.accept}
                  </button>
                  <button className="label-mono text-fg-tertiary hover:text-contradict">
                    {t.tree.reject}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
