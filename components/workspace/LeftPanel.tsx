"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { Input, Button } from "@/components/ui/primitives";
import type { FulltextStatus, EvidenceStance, Domain } from "@/lib/db/schema";
import type { SearchResult } from "@/lib/search/types";
import {
  searchExternal,
  searchLocalLibrary,
  resultToLibraryItem,
} from "@/lib/search/client";
import { extractPdf } from "@/lib/pdf";
import { suggestStrength } from "@/lib/grade";

/**
 * 左栏：文献库（Phase 2, §6.3）。
 * 检索(OpenAlex/arXiv) + PDF 上传全文提取 + 归档状态机 + 挂载为证据。
 * 纯离线时外部检索不可用，本地库关键词检索仍可用（§1.1 功能边界）。
 */
export default function LeftPanel() {
  const { t } = useI18n();
  const library = useAppStore((s) => s.library);
  const project = useAppStore((s) => s.project);
  const selectedNodeId = useAppStore((s) => s.selectedNodeId);
  const addLibraryItem = useAppStore((s) => s.addLibraryItem);
  const updateLibraryItem = useAppStore((s) => s.updateLibraryItem);
  const removeLibraryItem = useAppStore((s) => s.removeLibraryItem);
  const openStudy = useAppStore((s) => s.openStudy);

  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"library" | "search">("library");
  const [filter, setFilter] = useState<"all" | "fulltext" | "meta">("all");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const domain = (project?.domain ?? "general") as Domain;
  const pendingSearch = useAppStore((s) => s.pendingSearch);
  const clearPendingSearch = useAppStore((s) => s.clearPendingSearch);

  // 中栏对话框点「检索」→ 用节点命题填入并执行
  useEffect(() => {
    if (pendingSearch != null) {
      setQuery(pendingSearch);
      clearPendingSearch();
      // 用传入的词直接检索（避免依赖异步 state）
      void runSearchWith(pendingSearch);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSearch]);

  const localMatches = useMemo(
    () => (mode === "search" ? searchLocalLibrary(library, query) : []),
    [mode, library, query],
  );

  async function runSearchWith(raw: string) {
    const q = raw.trim();
    if (!q) return;
    setMode("search");
    setBusy(true);
    setSearchErr(null);
    setResults([]);
    try {
      const resp = await searchExternal(q);
      setResults(resp.results);
      if (resp.errors.length && resp.results.length === 0) {
        setSearchErr(resp.errors.map((e) => `${e.source}: ${e.message}`).join(" · "));
      }
    } catch (e) {
      setSearchErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  const runSearch = () => runSearchWith(query);

  async function addResultToLibrary(r: SearchResult) {
    await addLibraryItem(resultToLibraryItem(r));
  }

  // 从检索结果直接研读：先入库拿到 id，再打开研读
  async function studyResult(r: SearchResult) {
    const item = await addLibraryItem(resultToLibraryItem(r));
    openStudy(item.id);
  }

  // —— PDF 上传：提取全文 + 元数据，归档为 user_uploaded ——
  async function onUpload(file: File, targetId?: string) {
    setBusy(true);
    try {
      const ex = await extractPdf(file);
      const base = {
        title: ex.title || file.name.replace(/\.pdf$/i, ""),
        doi: ex.doi,
        year: ex.year,
        extracted_text: ex.text,
        page_count: ex.pageCount,
        file_hash: ex.fileHash,
        fulltext_status: "user_uploaded" as FulltextStatus,
        fulltext_source: "user_upload",
        read_status: "unread" as const,
      };
      if (targetId) {
        // 从"仅元数据"条目点上传原文 → 合并，状态转"有原文"（§6.3.3）
        await updateLibraryItem(targetId, {
          extracted_text: ex.text,
          page_count: ex.pageCount,
          file_hash: ex.fileHash,
          fulltext_status: "user_uploaded",
          fulltext_source: "user_upload",
          doi: base.doi,
          year: base.year,
        });
      } else {
        await addLibraryItem(base);
      }
    } catch (e) {
      setSearchErr(`PDF 解析失败：${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  }

  function handleFiles(files: FileList | null, targetId?: string) {
    if (!files) return;
    for (const f of Array.from(files)) {
      if (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")) {
        onUpload(f, targetId);
      }
    }
  }

  const filtered = library.filter((l) => {
    if (filter === "fulltext")
      return l.fulltext_status === "fulltext_available" || l.fulltext_status === "user_uploaded";
    if (filter === "meta") return l.fulltext_status === "metadata_only";
    return true;
  });

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
    <div
      className="flex h-full flex-col bg-bg-surface"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        handleFiles(e.dataTransfer.files);
      }}
    >
      {/* 搜索 */}
      <div className="border-b border-border px-3 py-2">
        <div className="mb-2 flex items-center justify-between">
          <span className="label-mono text-fg-secondary">{t.workspace.library}</span>
          <span className="label-mono text-fg-tertiary">{library.length}</span>
        </div>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && runSearch()}
          placeholder="⌕ 检索 OpenAlex / arXiv 或本地库"
          className="text-xs"
        />
        {mode === "search" && (
          <button
            onClick={() => setMode("library")}
            className="label-mono mt-2 text-fg-tertiary hover:text-fg-primary"
          >
            ‹ 返回文献库
          </button>
        )}
      </div>

      {mode === "library" ? (
        <>
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
                检索文献，或拖拽 PDF 到此处上传全文。
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
                    <p className="label-mono mt-0.5 text-fg-tertiary">
                      {[l.authors?.[0], l.year, l.venue].filter(Boolean).join(" · ")}
                      {l.cited_by != null ? ` · 引 ${l.cited_by}` : ""}
                    </p>
                    {l.doi && (
                      <p className="label-mono text-fg-tertiary">DOI {l.doi}</p>
                    )}
                    <div className="mt-1 flex items-center gap-3">
                      {l.fulltext_status === "metadata_only" && (
                        <label className="label-mono cursor-pointer text-fg-secondary hover:text-fg-primary">
                          ⬆ {t.workspace.uploadFulltext}
                          <input
                            type="file"
                            accept="application/pdf,.pdf"
                            className="hidden"
                            onChange={(e) => handleFiles(e.target.files, l.id)}
                          />
                        </label>
                      )}
                      {l.url && (
                        <a
                          href={l.url}
                          target="_blank"
                          rel="noreferrer"
                          className="label-mono text-fg-secondary hover:text-fg-primary"
                        >
                          ↗ 链接
                        </a>
                      )}
                      {l.oa_pdf_url && (
                        <a
                          href={l.oa_pdf_url}
                          target="_blank"
                          rel="noreferrer"
                          className="label-mono text-fg-secondary hover:text-fg-primary"
                        >
                          ↗ 原文
                        </a>
                      )}
                      {(l.extracted_text || l.abstract) && (
                        <button
                          onClick={() => openStudy(l.id)}
                          className="label-mono text-fg-secondary hover:text-fg-primary"
                        >
                          ▤ 研读
                        </button>
                      )}
                      <MountControl libItemId={l.id} />
                      <button
                        onClick={() => removeLibraryItem(l.id)}
                        className="label-mono ml-auto text-fg-tertiary hover:text-contradict"
                      >
                        ✕
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : (
        // —— 检索结果视图 ——
        <div className="flex-1 overflow-y-auto">
          {busy && <p className="px-3 py-3 text-xs text-fg-tertiary">检索中…</p>}
          {searchErr && (
            <p className="px-3 py-3 text-xs text-contradict">{searchErr}</p>
          )}

          {localMatches.length > 0 && (
            <div>
              <p className="label-mono px-3 py-1 text-fg-tertiary">
                本地库 {localMatches.length}
              </p>
              {localMatches.map(({ item, snippet }) => (
                <div key={item.id} className="border-b border-border px-3 py-2">
                  <p className="font-sans text-xs text-fg-primary">{item.title}</p>
                  {snippet && (
                    <p className="mt-0.5 text-xs text-fg-secondary">{snippet}</p>
                  )}
                  <MountControl libItemId={item.id} />
                </div>
              ))}
            </div>
          )}

          {results.length > 0 && (
            <p className="label-mono px-3 py-1 text-fg-tertiary">
              外部检索 {results.length}
            </p>
          )}
          {results.map((r, i) => (
            <ResultCard
              key={`${r.doi ?? r.openalex_id ?? r.arxiv_id ?? i}`}
              r={r}
              onAdd={() => addResultToLibrary(r)}
              onStudy={() => studyResult(r)}
              domain={domain}
              selectedNodeId={selectedNodeId}
            />
          ))}

          {!busy && results.length === 0 && localMatches.length === 0 && !searchErr && (
            <p className="px-3 py-4 text-xs text-fg-tertiary">无结果</p>
          )}
        </div>
      )}

      {/* 底部：上传原文 / 手动添加 */}
      <div className="border-t border-border p-2">
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <Button
          className="w-full"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          ⬆ 上传 PDF（拖拽亦可）
        </Button>
      </div>
    </div>
  );
}

/** 外部检索结果卡片：加入库 + 直接挂载到选中节点。 */
function ResultCard({
  r,
  onAdd,
  onStudy,
  domain,
  selectedNodeId,
}: {
  r: SearchResult;
  onAdd: () => void;
  onStudy: () => void;
  domain: Domain;
  selectedNodeId: string | null;
}) {
  const [added, setAdded] = useState(false);
  const addEvidence = useAppStore((s) => s.addEvidence);
  const nodes = useAppStore((s) => s.nodes);

  async function mount(stance: EvidenceStance) {
    if (!selectedNodeId) return;
    const node = nodes.find((n) => n.id === selectedNodeId);
    const strength = node ? suggestStrength(node, domain, "paper").suggested : 3;
    await addEvidence({
      node_id: selectedNodeId,
      source_type: "paper",
      stance,
      strength,
      title: r.title,
      doi: r.doi,
      openalex_id: r.openalex_id,
      url: r.url,
      authors: r.authors,
      year: r.year,
      excerpt: r.abstract,
    });
  }

  return (
    <div className="border-b border-border px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <p className="font-sans text-xs text-fg-primary">{r.title}</p>
        <span className="label-mono shrink-0 text-fg-tertiary">
          {r.source === "arxiv" ? "arXiv" : "OA"}
        </span>
      </div>
      <p className="label-mono mt-0.5 text-fg-tertiary">
        {[r.authors[0], r.year, r.venue].filter(Boolean).join(" · ")}
        {r.cited_by != null ? ` · 引 ${r.cited_by}` : ""}
      </p>
      {r.abstract && (
        <p className="mt-1 line-clamp-3 text-xs text-fg-secondary">{r.abstract}</p>
      )}
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <button
          onClick={() => {
            onAdd();
            setAdded(true);
          }}
          disabled={added}
          className="label-mono rounded-sm border border-border px-2 py-0.5 text-fg-secondary hover:bg-bg-hover disabled:opacity-40"
        >
          {added ? "✓ 已加入库" : "＋ 加入库"}
        </button>
        {r.url && (
          <a
            href={r.url}
            target="_blank"
            rel="noreferrer"
            className="label-mono rounded-sm border border-border px-2 py-0.5 text-fg-secondary hover:bg-bg-hover"
          >
            ↗ 链接
          </a>
        )}
        <button
          onClick={onStudy}
          className="label-mono rounded-sm border border-border px-2 py-0.5 text-fg-secondary hover:bg-bg-hover"
        >
          ▤ 研读
        </button>
        {selectedNodeId ? (
          <span className="flex items-center gap-1">
            <span className="label-mono text-fg-tertiary">挂载：</span>
            <MountBtn onClick={() => mount("supports")} label="支持" />
            <MountBtn onClick={() => mount("contradicts")} label="反对" danger />
            <MountBtn onClick={() => mount("ambiguous")} label="含混" />
          </span>
        ) : (
          <span className="label-mono text-fg-tertiary">（选中节点后可挂载）</span>
        )}
      </div>
    </div>
  );
}

/** 库内条目挂载到选中节点。 */
function MountControl({ libItemId }: { libItemId: string }) {
  const selectedNodeId = useAppStore((s) => s.selectedNodeId);
  const library = useAppStore((s) => s.library);
  const nodes = useAppStore((s) => s.nodes);
  const project = useAppStore((s) => s.project);
  const addEvidence = useAppStore((s) => s.addEvidence);
  const domain = (project?.domain ?? "general") as Domain;
  const [open, setOpen] = useState(false);

  if (!selectedNodeId) return null;

  async function mount(stance: EvidenceStance) {
    const item = library.find((l) => l.id === libItemId);
    if (!item) return;
    const node = nodes.find((n) => n.id === selectedNodeId);
    const strength = node ? suggestStrength(node, domain, "paper").suggested : 3;
    await addEvidence({
      node_id: selectedNodeId!,
      source_type: "paper",
      stance,
      strength,
      title: item.title,
      doi: item.doi,
      openalex_id: item.openalex_id,
      url: item.url,
      authors: item.authors,
      year: item.year,
      excerpt: item.abstract,
    });
    setOpen(false);
  }

  return (
    <span className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="label-mono text-fg-secondary hover:text-fg-primary"
      >
        ⚑ 挂载
      </button>
      {open && (
        <span className="absolute z-10 mt-1 flex gap-1 rounded-sm border border-border bg-bg-raised p-1">
          <MountBtn onClick={() => mount("supports")} label="支持" />
          <MountBtn onClick={() => mount("contradicts")} label="反对" danger />
          <MountBtn onClick={() => mount("ambiguous")} label="含混" />
        </span>
      )}
    </span>
  );
}

function MountBtn({
  onClick,
  label,
  danger,
}: {
  onClick: () => void;
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`label-mono rounded-sm border px-1.5 py-0.5 ${
        danger
          ? "border-contradict/50 text-contradict hover:bg-contradict/10"
          : "border-border text-fg-secondary hover:bg-bg-hover"
      }`}
    >
      {label}
    </button>
  );
}
