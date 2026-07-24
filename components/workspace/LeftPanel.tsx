"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { Input, Button } from "@/components/ui/primitives";
import type { FulltextStatus } from "@/lib/db/schema";

/**
 * 左栏：文献库（§6.3）。Phase 1 只做 UI 外壳 + 本地手动添加条目。
 * 检索/上传/归档状态机在 Phase 2。fulltext_status 必须永远可见。
 */
export default function LeftPanel() {
  const { t } = useI18n();
  const library = useAppStore((s) => s.library);
  const addLibraryItem = useAppStore((s) => s.addLibraryItem);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "fulltext" | "meta">("all");
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");

  const filtered = library.filter((l) => {
    if (query && !`${l.title} ${l.authors?.join(" ")} ${l.doi}`.toLowerCase().includes(query.toLowerCase()))
      return false;
    if (filter === "fulltext")
      return l.fulltext_status === "fulltext_available" || l.fulltext_status === "user_uploaded";
    if (filter === "meta") return l.fulltext_status === "metadata_only";
    return true;
  });

  async function submit() {
    if (!title.trim()) return;
    await addLibraryItem({
      title: title.trim(),
      fulltext_status: "metadata_only",
      read_status: "unread",
    });
    setTitle("");
    setAdding(false);
  }

  const statusMark: Record<FulltextStatus, string> = {
    fulltext_available: "▣",
    user_uploaded: "▣",
    metadata_only: "○",
    unavailable: "⊘",
  };

  const counts = {
    all: library.length,
    fulltext: library.filter(
      (l) => l.fulltext_status === "fulltext_available" || l.fulltext_status === "user_uploaded",
    ).length,
    meta: library.filter((l) => l.fulltext_status === "metadata_only").length,
  };

  return (
    <div className="flex h-full flex-col bg-bg-surface">
      <div className="border-b border-border px-3 py-2">
        <div className="mb-2 flex items-center justify-between">
          <span className="label-mono text-fg-secondary">{t.workspace.library}</span>
          <span className="label-mono text-fg-tertiary">{library.length}</span>
        </div>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="⌕ 标题 / 作者 / DOI"
          className="text-xs"
        />
      </div>

      <div className="flex flex-col gap-1 border-b border-border px-3 py-2">
        {(
          [
            ["all", t.workspace.filterAll, counts.all],
            ["fulltext", t.workspace.filterFulltext, counts.fulltext],
            ["meta", t.workspace.filterMetaOnly, counts.meta],
          ] as const
        ).map(([k, label, count]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`label-mono flex items-center justify-between rounded-sm px-2 py-1 text-left ${
              filter === k ? "bg-bg-raised text-fg-primary" : "text-fg-tertiary hover:bg-bg-hover"
            }`}
          >
            <span>{label}</span>
            <span>{count}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-3 py-4 text-xs text-fg-tertiary">
            Phase 1：可手动添加条目。检索与上传原文在 Phase 2 接入 OpenAlex / arXiv。
          </p>
        ) : (
          <ul>
            {filtered.map((l) => (
              <li key={l.id} className="border-b border-border px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-sans text-xs text-fg-primary">{l.title}</p>
                  <span
                    className="label-mono shrink-0 text-fg-tertiary"
                    title={l.fulltext_status}
                  >
                    {statusMark[l.fulltext_status]}
                  </span>
                </div>
                {l.doi && (
                  <p className="label-mono mt-0.5 text-fg-tertiary">DOI {l.doi}</p>
                )}
                {l.fulltext_status === "metadata_only" && (
                  <button
                    disabled
                    title={t.workspace.phase2Note}
                    className="label-mono mt-1 cursor-not-allowed text-fg-tertiary opacity-50"
                  >
                    ⬆ {t.workspace.uploadFulltext}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-border p-2">
        {adding ? (
          <div className="space-y-2">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="文献标题"
              className="text-xs"
              autoFocus
            />
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => setAdding(false)}>
                {t.common.cancel}
              </Button>
              <Button variant="primary" className="flex-1" onClick={submit}>
                {t.common.add}
              </Button>
            </div>
          </div>
        ) : (
          <Button className="w-full" onClick={() => setAdding(true)}>
            ⊕ {t.workspace.addLibraryItem}
          </Button>
        )}
      </div>
    </div>
  );
}
