"use client";

import { useEffect, useState } from "react";
import Header from "./Header";
import LeftPanel from "./LeftPanel";
import CenterPanel from "./CenterPanel";
import RightPanel from "./RightPanel";
import StudyMode from "./StudyMode";
import { useAppStore } from "@/lib/store";

/**
 * 三栏工作区（§6.0）。左窄、中宽、右宽。
 * 每个面板只挂载一次，靠 CSS 断点重排（避免双挂 React Flow / 布局副作用跑两遍）：
 *   ≥ md：三栏并排，栏间有可拖拽分隔条调整宽度（左栏可收起）
 *   < md：底部 tab 全屏切换三个视图
 * 研读模式（studyItemId）以全屏覆盖层出现在最上层。
 */
type MobileView = "library" | "center" | "tree";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export default function Workspace() {
  const [mobileView, setMobileView] = useState<MobileView>("tree");
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [leftW, setLeftW] = useState(300);
  const [rightW, setRightW] = useState(440);
  const [isDesktop, setIsDesktop] = useState(true);
  const studyItemId = useAppStore((s) => s.studyItemId);

  // 桌面断点（md = 768px）；宽度拖拽只在桌面生效
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const show = (v: MobileView) => (mobileView === v ? "flex" : "hidden");

  // 拖拽分隔条：left 增减左栏宽，right 反向增减右栏宽
  function startDrag(e: React.PointerEvent, which: "left" | "right") {
    e.preventDefault();
    const startX = e.clientX;
    const startLeft = leftW;
    const startRight = rightW;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      if (which === "left") setLeftW(clamp(startLeft + dx, 200, 560));
      else setRightW(clamp(startRight - dx, 300, 720));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  return (
    <div className="flex h-full flex-col bg-bg-void">
      <Header />

      <div className="flex min-h-0 flex-1">
        {/* 左栏 */}
        <div
          className={`${show("library")} ${
            leftCollapsed ? "md:hidden" : "md:flex"
          } min-h-0 w-full min-w-0 shrink-0 border-r border-border`}
          style={isDesktop && !leftCollapsed ? { width: leftW, flex: "none" } : undefined}
        >
          <div className="h-full w-full">
            <LeftPanel />
          </div>
        </div>

        {/* 左栏收起把手（仅桌面） */}
        <button
          onClick={() => setLeftCollapsed((c) => !c)}
          className="label-mono hidden w-4 shrink-0 border-r border-border bg-bg-surface text-fg-tertiary hover:bg-bg-hover md:block"
          title={leftCollapsed ? "展开文献库" : "收起文献库"}
        >
          {leftCollapsed ? "›" : "‹"}
        </button>

        {/* 左/中 分隔条（可拖拽，仅桌面且左栏展开） */}
        {isDesktop && !leftCollapsed && (
          <ColResizer onPointerDown={(e) => startDrag(e, "left")} />
        )}

        {/* 中栏 */}
        <div
          className={`${show("center")} md:flex min-h-0 w-full min-w-0 flex-1 border-r border-border`}
        >
          <div className="h-full w-full">
            <CenterPanel />
          </div>
        </div>

        {/* 中/右 分隔条（可拖拽，仅桌面） */}
        {isDesktop && <ColResizer onPointerDown={(e) => startDrag(e, "right")} />}

        {/* 右栏 */}
        <div
          className={`${show("tree")} md:flex min-h-0 w-full min-w-0 flex-1`}
          style={isDesktop ? { width: rightW, flex: "none" } : undefined}
        >
          <div className="h-full w-full">
            <RightPanel />
          </div>
        </div>
      </div>

      {/* 移动端底部切换（< md） */}
      <nav className="flex border-t border-border bg-bg-surface md:hidden">
        {(
          [
            ["library", "文献库"],
            ["center", "叙述"],
            ["tree", "逻辑树"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setMobileView(k)}
            className={`label-mono flex-1 py-3 ${
              mobileView === k ? "bg-bg-raised text-fg-primary" : "text-fg-tertiary"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* 研读模式覆盖层 */}
      {studyItemId && <StudyMode />}
    </div>
  );
}

/** 栏间竖直拖拽分隔条（桌面）。 */
function ColResizer({
  onPointerDown,
}: {
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  return (
    <div
      onPointerDown={onPointerDown}
      className="hidden w-1 shrink-0 cursor-col-resize bg-border hover:bg-fg-tertiary md:block"
      title="拖拽调整宽度"
    />
  );
}
