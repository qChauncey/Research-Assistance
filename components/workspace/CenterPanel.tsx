"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { getMeta, setMeta } from "@/lib/db/storage";
import DialogBox from "./DialogBox";

/**
 * 中栏：研究现状 / 论文（§6.4）+ 底部对话框（§6.5，唯一 AI 入口）。
 * 叙述模式基础富文本编辑（受控 textarea + 本地持久化）；正式论文模式为 Phase 4 外壳。
 * 对话框（Phase 3）五种调用类型见 DialogBox。
 */
export default function CenterPanel() {
  const { t } = useI18n();
  const project = useAppStore((s) => s.project);
  const [mode, setMode] = useState<"narrative" | "formal">("narrative");
  const [text, setText] = useState("");
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
