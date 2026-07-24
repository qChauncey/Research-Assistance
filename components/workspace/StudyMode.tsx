"use client";

import { useMemo, useRef, useState } from "react";
import { useAppStore } from "@/lib/store";
import { parseSections, sectionPreview, type StudySection } from "@/lib/study";
import {
  composeSystem,
  explainPassagePrompt,
  analyzeComparePrompt,
  summarizeSectionsPrompt,
} from "@/lib/prompts";
import { chat, extractJSON, NotConfiguredError } from "@/lib/llm/client";
import { extractPdf } from "@/lib/pdf";
import type { Domain, FulltextStatus } from "@/lib/db/schema";

/**
 * 研读模式（新增大功能）。全屏覆盖层。
 * 左：论文各模块（章节）概览；右：点选模块 → 对应原文。
 * 底部对话两种模式：
 *   「什么是…？」用户粘贴原文 → AI 解释；
 *   「分析」→ 与库中其它相关论文对比分析。
 * 沿用约束：AI 只解释/归纳，不编造；产出停留在研读面板，不入树。
 */
type StudyTab = "explain" | "analyze";

export default function StudyMode() {
  const studyItemId = useAppStore((s) => s.studyItemId);
  const closeStudy = useAppStore((s) => s.closeStudy);
  const library = useAppStore((s) => s.library);
  const project = useAppStore((s) => s.project);
  const apiConfig = useAppStore((s) => s.apiConfig);
  const language = useAppStore((s) => s.language);
  const updateLibraryItem = useAppStore((s) => s.updateLibraryItem);

  const [fetching, setFetching] = useState(false);
  const [fetchErr, setFetchErr] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<Record<string, string>>({});
  const [summarizing, setSummarizing] = useState(false);
  const [sumErr, setSumErr] = useState<string | null>(null);

  const item = library.find((l) => l.id === studyItemId) ?? null;
  const domain = (project?.domain ?? "general") as Domain;
  const outputLang = language?.ui ?? "zh-CN";
  const system = useMemo(() => composeSystem(domain, outputLang), [domain, outputLang]);

  // 全文优先用 extracted_text；仅元数据时退化到 abstract。
  const sourceText = item?.extracted_text?.trim() || item?.abstract?.trim() || "";
  const sections = useMemo<StudySection[]>(
    () => parseSections(sourceText),
    [sourceText],
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = sections.find((s) => s.id === activeId) ?? sections[0] ?? null;

  const [tab, setTab] = useState<StudyTab>("explain");

  async function fetchFulltext() {
    if (!item?.oa_pdf_url || fetching) return;
    setFetchErr(null);
    setFetching(true);
    try {
      const res = await fetch("/api/fetch-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: item.oa_pdf_url }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `抓取失败 ${res.status}`);
      }
      const buf = await res.arrayBuffer();
      const file = new File([buf], "fulltext.pdf", { type: "application/pdf" });
      const ex = await extractPdf(file);
      await updateLibraryItem(item.id, {
        extracted_text: ex.text,
        page_count: ex.pageCount,
        file_hash: ex.fileHash,
        fulltext_status: "user_uploaded" as FulltextStatus,
        fulltext_source: item.fulltext_source ?? "publisher_oa",
      });
    } catch (e) {
      setFetchErr(e instanceof Error ? e.message : String(e));
    } finally {
      setFetching(false);
    }
  }

  async function summarizeModules() {
    if (summarizing || sections.length === 0 || !item) return;
    setSumErr(null);
    setSummarizing(true);
    try {
      const reply = await chat(apiConfig, {
        system,
        messages: [
          {
            role: "user",
            content: summarizeSectionsPrompt(
              item.title,
              sections.map((s) => ({ title: s.title, body: s.body })),
            ),
          },
        ],
        maxTokens: Math.min(2000, 400 + sections.length * 60),
      });
      const parsed = extractJSON<{ summaries?: { i?: number; summary?: string }[] }>(
        reply,
      );
      const map: Record<string, string> = {};
      for (const s of parsed?.summaries ?? []) {
        const idx = (s.i ?? 0) - 1;
        if (idx >= 0 && idx < sections.length && s.summary) {
          map[sections[idx].id] = s.summary.trim();
        }
      }
      if (Object.keys(map).length === 0) {
        setSumErr("未能解析概述，可重试或换更快的模型。");
      } else {
        setSummaries(map);
      }
    } catch (e) {
      setSumErr(
        e instanceof NotConfiguredError
          ? e.message
          : e instanceof Error
            ? e.message
            : String(e),
      );
    } finally {
      setSummarizing(false);
    }
  }

  if (!studyItemId || !item) return null;

  const metaOnly = !item.extracted_text?.trim();

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg-void">
      {/* 顶栏 */}
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="label-mono text-fg-tertiary">研读</span>
            <span className="truncate font-sans text-sm text-fg-primary">
              {item.title}
            </span>
          </div>
          <p className="label-mono mt-0.5 truncate text-fg-tertiary">
            {[item.authors?.[0], item.year, item.venue].filter(Boolean).join(" · ")}
            {metaOnly
              ? item.oa_pdf_url
                ? " · 仅摘要 · 可获取全文"
                : " · 仅摘要（无开放全文，上传 PDF 可分段）"
              : ` · ${sections.length} 个模块`}
          </p>
          {fetchErr && <p className="label-mono mt-0.5 text-contradict">⚠ {fetchErr}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {metaOnly && item.oa_pdf_url && (
            <button
              onClick={fetchFulltext}
              disabled={fetching}
              className="label-mono rounded-sm border border-border px-3 py-1 text-fg-secondary hover:bg-bg-hover hover:text-fg-primary disabled:opacity-40"
            >
              {fetching ? "获取中…" : "⬇ 获取全文"}
            </button>
          )}
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="label-mono text-fg-secondary hover:text-fg-primary"
            >
              ↗ 链接
            </a>
          )}
          <button
            onClick={closeStudy}
            className="label-mono rounded-sm border border-border px-3 py-1 text-fg-secondary hover:bg-bg-hover hover:text-fg-primary"
          >
            ✕ 关闭
          </button>
        </div>
      </div>

      {/* 上部：左概览 + 右原文 */}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* 左：模块概览（各模块概述） */}
        <div className="flex min-h-0 shrink-0 flex-col border-b border-border md:w-[320px] md:border-b-0 md:border-r">
          {sections.length > 0 && (
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
              <span className="label-mono text-fg-tertiary">
                模块概览 · {sections.length}
              </span>
              <button
                onClick={summarizeModules}
                disabled={summarizing}
                title="用 AI 为每个模块生成一句话概述"
                className="label-mono rounded-sm border border-border px-2 py-0.5 text-fg-secondary hover:bg-bg-hover hover:text-fg-primary disabled:opacity-40"
              >
                {summarizing
                  ? "生成中…"
                  : Object.keys(summaries).length
                    ? "↻ 重新概述"
                    : "⚡ 生成概述"}
              </button>
            </div>
          )}
          {sumErr && <p className="px-4 py-1.5 text-xs text-contradict">⚠ {sumErr}</p>}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {sections.length === 0 ? (
              <p className="px-4 py-4 text-xs text-fg-tertiary">
                这篇没有可分段的原文。上传或「⬇ 获取全文」后可获得模块概览。
              </p>
            ) : (
              <ul>
                {sections.map((s) => (
                  <li key={s.id}>
                    <button
                      onClick={() => setActiveId(s.id)}
                      className={`block w-full border-b border-border px-4 py-2.5 text-left ${
                        active?.id === s.id ? "bg-bg-raised" : "hover:bg-bg-hover"
                      } ${s.level > 0 ? "pl-7" : ""}`}
                    >
                      <p
                        className={`font-sans text-xs ${
                          active?.id === s.id ? "text-fg-primary" : "text-fg-secondary"
                        }`}
                      >
                        {s.title}
                      </p>
                      <p
                        className={`mt-0.5 line-clamp-3 text-xs ${
                          summaries[s.id]
                            ? "text-fg-secondary"
                            : "label-mono text-fg-tertiary"
                        }`}
                      >
                        {summaries[s.id] ?? sectionPreview(s.body)}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* 右：对应原文 */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {active ? (
            <div className="px-5 py-4">
              <h3 className="mb-2 font-sans text-sm text-fg-primary">{active.title}</h3>
              <p className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-fg-secondary">
                {active.body}
              </p>
            </div>
          ) : (
            <p className="px-5 py-4 text-xs text-fg-tertiary">左侧选择一个模块查看原文。</p>
          )}
        </div>
      </div>

      {/* 底部：研读对话 */}
      <StudyDialog
        tab={tab}
        setTab={setTab}
        system={system}
        apiConfig={apiConfig}
        paperTitle={item.title}
        paperSummary={buildSummary(item.title, item.abstract, active?.body)}
        others={library
          .filter((l) => l.id !== item.id)
          .map((l) => ({ title: l.title, abstract: l.abstract }))}
        activeTitle={active?.title}
      />
    </div>
  );
}

function buildSummary(title: string, abstract?: string, activeBody?: string): string {
  const parts = [`标题：${title}`];
  if (abstract?.trim()) parts.push(`摘要：${abstract.trim()}`);
  if (activeBody?.trim())
    parts.push(`当前研读段落：${activeBody.trim().slice(0, 1200)}`);
  return parts.join("\n");
}

function StudyDialog({
  tab,
  setTab,
  system,
  apiConfig,
  paperTitle,
  paperSummary,
  others,
  activeTitle,
}: {
  tab: StudyTab;
  setTab: (t: StudyTab) => void;
  system: string;
  apiConfig: ReturnType<typeof useAppStore.getState>["apiConfig"];
  paperTitle: string;
  paperSummary: string;
  others: { title: string; abstract?: string }[];
  activeTitle?: string;
}) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [output, setOutput] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);
  const outRef = useRef<HTMLDivElement>(null);

  async function run() {
    if (busy) return;
    const q = input.trim();
    if (tab === "explain" && !q) {
      setErr("把想弄懂的原文段落粘贴进来。");
      return;
    }
    setErr(null);
    setBusy(true);
    setOutput("");
    try {
      const content =
        tab === "explain"
          ? explainPassagePrompt(paperTitle, q, activeTitle)
          : analyzeComparePrompt(paperTitle, paperSummary, others, q);
      const reply = await chat(apiConfig, {
        system,
        messages: [{ role: "user", content }],
        maxTokens: 1500,
      });
      setOutput(reply);
      requestAnimationFrame(() => outRef.current?.scrollTo({ top: 0 }));
    } catch (e) {
      setErr(
        e instanceof NotConfiguredError
          ? e.message
          : e instanceof Error
            ? e.message
            : String(e),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shrink-0 border-t border-border bg-bg-surface">
      <div className="flex items-center gap-1 px-3 pt-2">
        <TabBtn active={tab === "explain"} onClick={() => setTab("explain")}>
          什么是…？
        </TabBtn>
        <TabBtn active={tab === "analyze"} onClick={() => setTab("analyze")}>
          分析
        </TabBtn>
        <span className="label-mono ml-2 text-fg-tertiary">
          {tab === "explain" ? "粘贴原文 → AI 解释" : "与库中其它论文对比分析"}
        </span>
      </div>

      {output && (
        <div
          ref={outRef}
          className="mx-3 mt-2 overflow-y-auto rounded-sm border border-border bg-bg-void px-3 py-2"
          style={{ resize: "vertical", height: 200, minHeight: 88, maxHeight: 460 }}
        >
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-fg-secondary">
            {output}
          </p>
        </div>
      )}
      {err && <p className="px-3 pt-2 text-xs text-contradict">⚠ {err}</p>}

      <div className="p-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // 回车提交；Shift+回车换行；中文输入法组字中的回车不触发
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              run();
            }
          }}
          disabled={busy}
          rows={tab === "explain" ? 3 : 2}
          placeholder={
            tab === "explain"
              ? "把看不懂的原文段落粘贴到这里…（↵ 提交 · ⇧↵ 换行）"
              : "可选：聚焦某个论点/维度再对比（留空则对比核心论点）…（↵ 提交 · ⇧↵ 换行）"
          }
          className="w-full resize-none rounded-sm border border-border bg-bg-void px-3 py-2 text-sm text-fg-primary outline-none placeholder:text-fg-tertiary"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="label-mono text-fg-tertiary">
            {tab === "analyze" && others.length === 0
              ? "库中暂无其它论文可对比"
              : tab === "analyze"
                ? `可对比 ${others.length} 篇`
                : ""}
          </span>
          <button
            onClick={run}
            disabled={busy || (tab === "explain" && !input.trim())}
            className="label-mono rounded-sm border border-border px-3 py-1 text-fg-secondary hover:bg-bg-hover hover:text-fg-primary disabled:opacity-40"
          >
            {busy ? "思考中…" : tab === "explain" ? "解释" : "分析"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`label-mono rounded-sm px-3 py-1 ${
        active
          ? "bg-bg-raised text-fg-primary"
          : "text-fg-tertiary hover:bg-bg-hover hover:text-fg-secondary"
      }`}
    >
      {children}
    </button>
  );
}
