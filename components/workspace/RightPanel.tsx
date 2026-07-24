"use client";

import { useCallback, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { getDomain } from "@/lib/domains";
import MaturityPanel from "./MaturityPanel";
import TreeCanvas from "./tree/TreeCanvas";
import CandidatesDrawer from "./tree/CandidatesDrawer";
import NodeEditPanel from "./tree/NodeEditPanel";

/**
 * 右栏：逻辑树（§6.6）。
 * 结构：常驻成熟度指标 + React Flow 树（含工具栏/候选区抽屉）+ 双击滑出的编辑面板。
 * React Flow 容器必须有显式高度——外层用 flex + min-h-0 保证高度链路完整。
 * 空态覆盖层放在此（relative 容器内），不放进 React Flow Panel——避免 top-center 变换外溢。
 */
export default function RightPanel() {
  const { t } = useI18n();
  const [editNodeId, setEditNodeId] = useState<string | null>(null);
  const nodeCount = useAppStore((s) => s.nodes.length);
  const project = useAppStore((s) => s.project);
  const addNode = useAppStore((s) => s.addNode);

  const addRoot = useCallback(async () => {
    if (!project) return;
    const schema = getDomain(project.domain);
    const node = await addNode({
      claim: "",
      node_type: schema.nodeTypes[0].id,
      parent_id: null,
      position: { x: 0, y: 0 },
    });
    setEditNodeId(node.id);
  }, [project, addNode]);

  return (
    <div className="flex h-full min-h-0 w-full">
      <div className="flex min-h-0 flex-1 flex-col">
        <MaturityPanel />
        {/* 树画布 —— 必须有显式高度 */}
        <div className="relative min-h-0 flex-1">
          <TreeCanvas onEditNode={setEditNodeId} />

          {nodeCount === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="pointer-events-auto max-w-sm rounded-sm border border-dashed border-border bg-bg-surface/85 p-6 text-center backdrop-blur">
                <p className="label-mono mb-2 text-fg-secondary">
                  {t.tree.emptyTitle}
                </p>
                <p className="mb-4 text-xs leading-relaxed text-fg-tertiary">
                  {t.tree.emptyHint}
                </p>
                <button
                  onClick={addRoot}
                  className="label-mono rounded-sm border border-border-focus bg-fg-primary px-3 py-2 text-bg-void hover:bg-fg-secondary"
                >
                  ⊕ {t.tree.addRoot}
                </button>
              </div>
            </div>
          )}
        </div>
        <CandidatesDrawer />
      </div>

      {editNodeId && (
        <NodeEditPanel nodeId={editNodeId} onClose={() => setEditNodeId(null)} />
      )}
    </div>
  );
}
