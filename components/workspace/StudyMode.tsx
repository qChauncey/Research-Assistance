"use client";

import { useMemo, useRef, useState } from "react";
import { useAppStore } from "@/lib/store";
import { parseSections, sectionPreview, type StudySection } from "@/lib/study";
import { composeSystem, explainPassagePrompt, analyzeComparePrompt } from "@/lib/prompts";
import { chat, NotConfiguredError } from "@/lib/llm/client";
import type { Domain } from "@/lib/db/schema";

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
            {metaOnly ? " · 仅摘要（上传 PDF 获取全文分段）" : ` · ${sections.length} 个模块`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
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
        {/* 左：模块概览 */}
        <div className="min-h-0 shrink-0 overflow-y-auto border-b border-border md:w-[320px] md:border-b-0 md:border-r">
          {sections.length === 0 ? (
            <p className="px-4 py-4 text-xs text-fg-tertiary">
              这篇没有可分段的原文。上传 PDF 全文后可获得模块概览。
            </p>
          ) : (
            <ul>
              {sections.map((s) => (
                <li key={s.id}>
                  <button
                    onClick={() => setActiveId(s.id)}
                    className={`block w-full border-b border-border px-4 py-2.5 text-left ${
                      active?.id === s.id
                        ? "bg-bg-raised"
                        : "hover:bg-bg-hover"
                    } ${s.level > 0 ? "pl-7" : ""}`}
                  >
                    <p
                      className={`font-sans text-xs ${
                        active?.id === s.id ? "text-fg-primary" : "text-fg-secondary"
                      }`}
                    >
                      {s.title}
                    </p>
                    <p className="label-mono mt-0.5 line-clamp-2 text-fg-tertiary">
                      {sectionPreview(s.body)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
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
            if (
              e.key === "Enter" &&
              (e.metaKey || e.ctrlKey) &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              run();
            }
          }}
          disabled={busy}
          rows={tab === "explain" ? 3 : 2}
          placeholder={
            tab === "explain"
              ? "把看不懂的原文段落粘贴到这里…（⌘/Ctrl + ↵ 提交）"
              : "可选：聚焦某个论点/维度再对比（留空则对比核心论点）…（⌘/Ctrl + ↵ 提交）"
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
