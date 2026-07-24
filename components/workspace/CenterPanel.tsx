"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { getMeta, setMeta } from "@/lib/db/storage";

/**
 * 中栏：研究现状 / 论文（§6.4）+ 底部对话框（§6.5）。
 * Phase 1：叙述模式只做基础富文本编辑（此处用受控 textarea + 本地持久化）；
 * 正式论文模式为 Phase 4 外壳。对话框五个动作按钮点击后显示"Phase 3 实现"。
 */
export default function CenterPanel() {
  const { t } = useI18n();
  const project = useAppStore((s) => s.project);
  const selectedNodeId = useAppStore((s) => s.selectedNodeId);
  const nodes = useAppStore((s) => s.nodes);
  const [mode, setMode] = useState<"narrative" | "formal">("narrative");
  const [text, setText] = useState("");
  const [phaseHint, setPhaseHint] = useState<string | null>(null);
  const loadedFor = useRef<string | null>(null);

  const narrativeKey = project ? `narrative:${project.id}` : null;

  // 载入/持久化叙述文本（存 meta store，键含 project id）
  useEffect(() => {
    if (!project) return;
    if (loadedFor.current === project.id) return;
    loadedFor.current = project.id;
    (async () => {
      const saved = await getMeta<string>(`narrative:${project.id}`);
      setText(saved ?? "");
    })();
  }, [project]);

  function persist(next: string) {
    setText(next);
    if (narrativeKey) setMeta(narrativeKey, next);
  }

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  const actions = [
    { key: "redteam", label: `⚔ ${t.workspace.actRedTeam}`, note: t.workspace.phase3Note },
    { key: "search", label: `⌕ ${t.workspace.actSearch}`, note: t.workspace.phase2Note },
    { key: "diverge", label: `✦ ${t.workspace.actDiverge}`, note: t.workspace.phase3Note },
    { key: "compare", label: `⇄ ${t.workspace.actCompare}`, note: t.workspace.phase3Note },
    { key: "makenode", label: `⊕ ${t.workspace.actMakeNode}`, note: t.workspace.phase3Note },
  ];

  return (
    <div className="flex h-full flex-col bg-bg-void">
      {/* 视图切换 */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex gap-1">
          <ModeTab active={mode === "narrative"} onClick={() => setMode("narrative")}>
            {t.workspace.narrative}
          </ModeTab>
          <ModeTab active={mode === "formal"} onClick={() => setMode("formal")}>
            {t.workspace.formalPaper}
          </ModeTab>
        </div>
        <span className="label-mono text-fg-tertiary">
          {project?.title}
        </span>
      </div>

      {/* 上部：叙述 / 论文 */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {mode === "narrative" ? (
          <textarea
            value={text}
            onChange={(e) => persist(e.target.value)}
            placeholder={t.workspace.narrativePlaceholder}
            className="h-full w-full resize-none bg-bg-void px-5 py-4 font-sans text-sm leading-relaxed text-fg-primary outline-none placeholder:text-fg-tertiary"
          />
        ) : (
          <div className="px-5 py-4">
            <p className="text-xs leading-relaxed text-fg-tertiary">
              正式论文模式按研究类型套用论文骨架并从树自动填充（含反证据强制进
              Limitations、未填 falsifier 标黄）。
              <br />
              <span className="text-fg-secondary">{t.workspace.phase4Note}</span>
            </p>
          </div>
        )}
      </div>

      {/* 底部：对话框（唯一 AI 入口，§6.5） */}
      <div className="border-t border-border bg-bg-surface">
        <div className="px-3 pt-2">
          <span className="label-mono text-fg-secondary">▸ {t.workspace.dialog}</span>
        </div>
        <div className="p-3">
          <div className="flex items-center gap-2 rounded-sm border border-border bg-bg-void px-3 py-2">
            <input
              disabled
              placeholder={t.workspace.searchPlaceholder}
              className="flex-1 bg-transparent text-sm text-fg-primary outline-none placeholder:text-fg-tertiary"
            />
            <span className="label-mono text-fg-tertiary">⌘↵</span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1">
            {actions.map((a) => (
              <button
                key={a.key}
                onClick={() => setPhaseHint(a.note)}
                className="label-mono rounded-sm border border-border px-2 py-1 text-fg-tertiary hover:bg-bg-hover hover:text-fg-secondary"
              >
                {a.label}
              </button>
            ))}
          </div>

          <div className="mt-2 flex items-center justify-between">
            <span className="label-mono text-fg-tertiary">
              {t.workspace.contextLabel}：
              {selectedNode ? selectedNode.claim.slice(0, 20) || "选中节点" : "整棵树"}
            </span>
            {phaseHint && (
              <span className="label-mono text-fg-secondary">{phaseHint}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ModeTab({
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
