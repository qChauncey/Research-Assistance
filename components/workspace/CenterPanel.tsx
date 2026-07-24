"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import DialogBox from "./DialogBox";
import FormalPaper from "./FormalPaper";
import NarrativeEditor from "./NarrativeEditor";

/**
 * 中栏：研究现状 / 论文（§6.4）+ 底部对话框（§6.5，唯一 AI 入口）。
 * 叙述模式（§6.4.1，@/[[ 引用）见 NarrativeEditor；正式论文模式（§6.4.2）见 FormalPaper；
 * 对话框（Phase 3）五种调用类型见 DialogBox。
 */
export default function CenterPanel() {
  const { t } = useI18n();
  const project = useAppStore((s) => s.project);
  const [mode, setMode] = useState<"narrative" | "formal">("narrative");

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
        {mode === "narrative" ? <NarrativeEditor /> : <FormalPaper />}
      </div>

      {/* 底部：对话框（唯一 AI 入口，§6.5，Phase 3） */}
      <DialogBox />
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
