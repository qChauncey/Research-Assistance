/**
 * dagre 自动布局 (§6.6)。
 * 只在用户主动点「自动布局」时执行；手动拖拽的 position 平时持久化、不被覆盖
 *（见"已知易踩点"）。
 */
import dagre from "@dagrejs/dagre";
import type { ArgNode } from "./db/schema";

export const NODE_WIDTH = 240;
export const NODE_HEIGHT = 110;

/** 给定节点集合，用 dagre 计算自上而下的布局，返回 id→坐标。 */
export function computeDagreLayout(
  nodes: ArgNode[],
): Record<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 48, ranksep: 72, marginx: 24, marginy: 24 });

  const ids = new Set(nodes.map((n) => n.id));
  for (const n of nodes) {
    g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const n of nodes) {
    if (n.parent_id && ids.has(n.parent_id)) {
      g.setEdge(n.parent_id, n.id);
    }
  }

  dagre.layout(g);

  const out: Record<string, { x: number; y: number }> = {};
  for (const n of nodes) {
    const pos = g.node(n.id);
    if (pos) {
      // dagre 返回中心点，React Flow 用左上角
      out[n.id] = { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 };
    }
  }
  return out;
}
