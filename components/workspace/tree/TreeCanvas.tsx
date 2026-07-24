"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Panel,
  BackgroundVariant,
  applyNodeChanges,
  type Node as RFNode,
  type Edge as RFEdge,
  type NodeChange,
  useReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import { useAppStore } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { getDomain } from "@/lib/domains";
import { computeDagreLayout, NODE_WIDTH, NODE_HEIGHT } from "@/lib/layout";
import ArgumentNode, {
  nodeEvidenceCounts,
  makeTypeLabel,
  type ArgNodeData,
} from "./ArgumentNode";
import type { ArgNode, Domain } from "@/lib/db/schema";

const nodeTypes = { arg: ArgumentNode };

function TreeCanvasInner({ onEditNode }: { onEditNode: (id: string) => void }) {
  const { t } = useI18n();
  const nodes = useAppStore((s) => s.nodes);
  const evidence = useAppStore((s) => s.evidence);
  const project = useAppStore((s) => s.project);
  const selectedNodeId = useAppStore((s) => s.selectedNodeId);
  const selectNode = useAppStore((s) => s.selectNode);
  const setNodePosition = useAppStore((s) => s.setNodePosition);
  const reparentNode = useAppStore((s) => s.reparentNode);
  const applyLayout = useAppStore((s) => s.applyLayout);
  const addNode = useAppStore((s) => s.addNode);
  const requestRedTeam = useAppStore((s) => s.requestRedTeam);
  const { fitView } = useReactFlow();

  const domain = (project?.domain ?? "general") as Domain;

  // 快速添加：默认取领域配置的第一个节点类型，创建后立即打开编辑面板。
  const quickAdd = useCallback(async () => {
    if (!project) return;
    const schema = getDomain(project.domain);
    const defaultType = schema.nodeTypes[0].id;
    const parent = selectedNodeId
      ? nodes.find((n) => n.id === selectedNodeId) ?? null
      : null;
    const node = await addNode({
      claim: "",
      node_type: defaultType,
      parent_id: parent?.id ?? null,
      position: seedChildPosition(parent),
    });
    onEditNode(node.id);
  }, [project, selectedNodeId, nodes, addNode, onEditNode]);

  const runAutoLayout = useCallback(() => {
    if (nodes.length === 0) return;
    applyLayout(computeDagreLayout(nodes));
    setTimeout(() => fitView({ duration: 300 }), 50);
  }, [nodes, applyLayout, fitView]);

  // 任何节点缺 position 时用 dagre 补齐并持久化（新建节点自动落位）。
  useEffect(() => {
    const missing = nodes.some((n) => !n.position);
    if (missing && nodes.length > 0) {
      const layout = computeDagreLayout(nodes);
      // 只填缺失的，保留手动拖拽过的位置
      const merged: Record<string, { x: number; y: number }> = {};
      for (const n of nodes) {
        if (!n.position && layout[n.id]) merged[n.id] = layout[n.id];
      }
      if (Object.keys(merged).length > 0) applyLayout(merged);
    }
  }, [nodes, applyLayout]);

  // 从 store 派生的目标 RF 节点。作为受控组件的"真相"，通过 effect 同步进本地状态。
  const derivedNodes: RFNode<ArgNodeData>[] = useMemo(
    () =>
      nodes.map((n) => {
        const { supports, contradicts } = nodeEvidenceCounts(evidence, n.id);
        return {
          id: n.id,
          type: "arg",
          position: n.position ?? { x: 0, y: 0 },
          data: {
            node: n,
            domain,
            typeLabel: makeTypeLabel(domain, n.node_type),
            supports,
            contradicts,
            selected: n.id === selectedNodeId,
          },
          selected: n.id === selectedNodeId,
        };
      }),
    [nodes, evidence, domain, selectedNodeId],
  );

  // 本地 RF 节点状态——拖拽时的流畅交互靠它；store 变化时重建（拖拽中不写 store，故不打断）。
  const [rfNodes, setRfNodes] = useState<RFNode<ArgNodeData>[]>(derivedNodes);
  useEffect(() => {
    setRfNodes(derivedNodes);
  }, [derivedNodes]);

  const rfEdges: RFEdge[] = useMemo(() => {
    const ids = new Set(nodes.map((n) => n.id));
    return nodes
      .filter((n) => n.parent_id && ids.has(n.parent_id))
      .map((n) => ({
        id: `${n.parent_id}->${n.id}`,
        source: n.parent_id as string,
        target: n.id,
        type: "smoothstep",
        style: { strokeWidth: 1 },
      }));
  }, [nodes]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // 本地应用全部变更（保证拖拽流畅）
      setRfNodes((nds) => applyNodeChanges(changes, nds) as RFNode<ArgNodeData>[]);
      // 拖拽结束时把最终位置持久化到 store / IndexedDB
      for (const c of changes) {
        if (c.type === "position" && c.position && c.dragging === false) {
          setNodePosition(c.id, c.position.x, c.position.y);
        }
      }
    },
    [setNodePosition],
  );

  // 拖到另一节点上 → 改父子关系
  const onNodeDragStop = useCallback(
    (_e: MouseEvent | TouchEvent, dragged: RFNode) => {
      const cx = dragged.position.x + NODE_WIDTH / 2;
      const cy = dragged.position.y + NODE_HEIGHT / 2;
      const target = nodes.find((n) => {
        if (n.id === dragged.id || !n.position) return false;
        return (
          cx >= n.position.x &&
          cx <= n.position.x + NODE_WIDTH &&
          cy >= n.position.y &&
          cy <= n.position.y + NODE_HEIGHT
        );
      });
      if (target) {
        reparentNode(dragged.id, target.id);
      }
    },
    [nodes, reparentNode],
  );

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={rfEdges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onNodeDragStop={onNodeDragStop}
      onNodeClick={(_e, n) => selectNode(n.id)}
      onNodeDoubleClick={(_e, n) => onEditNode(n.id)}
      onPaneClick={() => selectNode(null)}
      minZoom={0.2}
      maxZoom={1.5}
      fitView
      proOptions={{ hideAttribution: false }}
    >
      <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
      <Controls showInteractive={false} />

      {/* 工具栏（§6.6）：添加 · 红队(Phase3) · 自动布局 · 全览 */}
      <Panel position="top-left" className="!m-2">
        <div className="flex items-center gap-1 rounded-sm border border-border bg-bg-surface/90 p-1 backdrop-blur">
          <button
            onClick={quickAdd}
            className="label-mono rounded-sm px-2 py-1 text-fg-secondary hover:bg-bg-hover hover:text-fg-primary"
          >
            ⊕ {t.tree.addNode}
          </button>
          <button
            onClick={() => selectedNodeId && requestRedTeam(selectedNodeId)}
            disabled={!selectedNodeId}
            title={selectedNodeId ? "对选中节点执行红队（中栏对话框）" : "先选中一个节点"}
            className="label-mono rounded-sm px-2 py-1 text-fg-secondary hover:bg-bg-hover hover:text-fg-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            ⚔ {t.tree.redTeam}
          </button>
          <button
            onClick={runAutoLayout}
            className="label-mono rounded-sm px-2 py-1 text-fg-secondary hover:bg-bg-hover hover:text-fg-primary"
          >
            ⤢ {t.tree.autoLayout}
          </button>
          <button
            onClick={() => fitView({ duration: 300 })}
            className="label-mono rounded-sm px-2 py-1 text-fg-secondary hover:bg-bg-hover hover:text-fg-primary"
          >
            ⊞ {t.tree.fitView}
          </button>
        </div>
      </Panel>

    </ReactFlow>
  );
}

/** 提供 fitView 等 hook 需要的 provider，并暴露自动布局能力给工具栏。 */
export default function TreeCanvas({
  onEditNode,
}: {
  onEditNode: (id: string) => void;
}) {
  return (
    <ReactFlowProvider>
      <TreeCanvasInner onEditNode={onEditNode} />
    </ReactFlowProvider>
  );
}

export function seedChildPosition(parent: ArgNode | null): { x: number; y: number } {
  if (parent?.position) {
    return { x: parent.position.x, y: parent.position.y + NODE_HEIGHT + 72 };
  }
  return { x: 0, y: 0 };
}
