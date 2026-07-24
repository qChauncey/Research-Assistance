"use client";

import { useState } from "react";
import Header from "./Header";
import LeftPanel from "./LeftPanel";
import CenterPanel from "./CenterPanel";
import RightPanel from "./RightPanel";

/**
 * 三栏工作区（§6.0）。左窄、中宽、右宽。
 * 每个面板只挂载一次，靠 CSS 断点重排（避免双挂 React Flow / 布局副作用跑两遍）：
 *   ≥ md：三栏并排（左 280px · 中 flex 1.2 · 右 flex 1），左栏可收起
 *   < md：底部 tab 全屏切换三个视图
 */
type MobileView = "library" | "center" | "tree";

export default function Workspace() {
  const [mobileView, setMobileView] = useState<MobileView>("tree");
  const [leftCollapsed, setLeftCollapsed] = useState(false);

  const show = (v: MobileView) => (mobileView === v ? "flex" : "hidden");

  return (
    <div className="flex h-full flex-col bg-bg-void">
      <Header />

      <div className="flex min-h-0 flex-1">
        {/* 左栏 */}
        <div
          className={`${show("library")} ${
            leftCollapsed ? "md:hidden" : "md:flex"
          } min-h-0 w-full min-w-0 shrink-0 border-r border-border md:w-[280px]`}
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

        {/* 中栏 */}
        <div
          className={`${show("center")} md:flex min-h-0 w-full min-w-0 flex-[1.2] border-r border-border`}
        >
          <div className="h-full w-full">
            <CenterPanel />
          </div>
        </div>

        {/* 右栏 */}
        <div
          className={`${show("tree")} md:flex min-h-0 w-full min-w-0 flex-1`}
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
    </div>
  );
}
