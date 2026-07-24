"use client";

/**
 * 中央状态存储 (zustand)。
 *
 * 单一真相源：内存中持有当前项目的 nodes/evidence/candidates/library，
 * 每个 mutation 同步写入 IndexedDB。所有节点写入都经过 updateNode / addNode，
 * 由它们统一递增 client_rev 并重算 falsifier_status（§2.2 / A.1.1）——
 * 任何绕过这两个函数的直接写入都是 bug。
 */
import { create } from "zustand";
import type {
  Project,
  ArgNode,
  Evidence,
  Candidate,
  LibraryItem,
  ApiConfig,
  LanguageConfig,
  Domain,
  NodeStatus,
} from "./db/schema";
import { SCHEMA_VERSION } from "./db/schema";
import * as db from "./db/storage";
import { deriveFalsifierStatus } from "./methodology";
import { getDomain } from "./domains";

function now() {
  return new Date().toISOString();
}
function uid() {
  return crypto.randomUUID();
}

/** 新节点工厂：填好方法论字段默认值。 */
export function makeNode(
  projectId: string,
  domain: Domain,
  partial: Partial<ArgNode> & { claim: string; node_type: string },
): ArgNode {
  const ts = now();
  const base: ArgNode = {
    id: partial.id ?? uid(),
    project_id: projectId,
    parent_id: partial.parent_id ?? null,
    claim: partial.claim,
    node_type: partial.node_type,
    confidence: partial.confidence ?? null,
    status: partial.status ?? "open",
    domain_fields: partial.domain_fields ?? {},
    position: partial.position ?? null,
    order_index: partial.order_index ?? 0,
    falsifier: partial.falsifier ?? null,
    falsifier_status: partial.falsifier_status ?? "not_applicable",
    program_role: partial.program_role ?? null,
    methodology_flags: partial.methodology_flags ?? [],
    created_at: partial.created_at ?? ts,
    updated_at: partial.updated_at ?? ts,
    client_rev: partial.client_rev ?? 0,
  };
  base.falsifier_status = deriveFalsifierStatus(base, domain);
  return base;
}

interface AppState {
  ready: boolean;
  onboarded: boolean;
  userId: string | null;
  userEmail: string | null;

  apiConfig: ApiConfig | null;
  language: LanguageConfig | null;

  project: Project | null;
  nodes: ArgNode[];
  evidence: Evidence[];
  candidates: Candidate[];
  library: LibraryItem[];

  selectedNodeId: string | null;
  /** 跨栏检索请求：中栏对话框点「检索」→ 左栏接住并执行 */
  pendingSearch: string | null;
  /** 跨栏红队请求：右栏树工具栏点「红队」→ 中栏对话框接住并执行（节点 id） */
  pendingRedTeam: string | null;
  /** 研读模式：正在研读的文献库条目 id（null 关闭） */
  studyItemId: string | null;

  // —— 生命周期 ——
  init: () => Promise<void>;
  completeOnboarding: (input: {
    apiConfig: ApiConfig;
    language: LanguageConfig;
    domain: Domain;
    design?: string;
    projectTitle: string;
    userId?: string | null;
    userEmail?: string | null;
  }) => Promise<void>;
  loadProject: (projectId: string) => Promise<void>;

  // —— 节点 ——
  addNode: (
    partial: Partial<ArgNode> & { claim: string; node_type: string },
  ) => Promise<ArgNode>;
  updateNode: (id: string, patch: Partial<ArgNode>) => Promise<void>;
  removeNode: (id: string) => Promise<void>;
  reparentNode: (childId: string, parentId: string | null) => Promise<void>;
  setNodePosition: (id: string, x: number, y: number) => Promise<void>;
  applyLayout: (positions: Record<string, { x: number; y: number }>) => Promise<void>;
  selectNode: (id: string | null) => void;

  // —— 证据 ——
  addEvidence: (e: Omit<Evidence, "id" | "project_id" | "created_at">) => Promise<void>;
  removeEvidence: (id: string) => Promise<void>;

  // —— 文献库 ——
  addLibraryItem: (
    l: Omit<LibraryItem, "id" | "project_id" | "added_at">,
  ) => Promise<LibraryItem>;
  updateLibraryItem: (id: string, patch: Partial<LibraryItem>) => Promise<void>;
  removeLibraryItem: (id: string) => Promise<void>;

  // —— 候选区（约束四：AI 产出永不自动入树，判死/采纳才生效） ——
  addCandidate: (
    c: Omit<Candidate, "id" | "project_id" | "created_at" | "verdict">,
  ) => Promise<void>;
  rejectCandidate: (id: string) => Promise<void>;
  acceptCandidate: (id: string) => Promise<void>;

  // —— 会话 ——
  setUser: (userId: string | null, email: string | null) => Promise<void>;
  refreshProject: () => Promise<void>;
  requestSearch: (query: string) => void;
  clearPendingSearch: () => void;
  requestRedTeam: (nodeId: string) => void;
  clearPendingRedTeam: () => void;
  openStudy: (libItemId: string) => void;
  closeStudy: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  onboarded: false,
  userId: null,
  userEmail: null,
  apiConfig: null,
  language: null,
  project: null,
  nodes: [],
  evidence: [],
  candidates: [],
  library: [],
  selectedNodeId: null,
  pendingSearch: null,
  pendingRedTeam: null,
  studyItemId: null,

  init: async () => {
    const [apiConfig, language, onboarded, activeProjectId, userId, userEmail] =
      await Promise.all([
        db.getSetting("apiConfig"),
        db.getSetting("language"),
        db.getSetting("onboarded"),
        db.getSetting("activeProjectId"),
        db.getSetting("userId"),
        db.getSetting("userEmail"),
      ]);

    set({
      apiConfig: apiConfig ?? null,
      language: language ?? null,
      onboarded: !!onboarded,
      userId: userId ?? null,
      userEmail: userEmail ?? null,
    });

    if (onboarded && activeProjectId) {
      await get().loadProject(activeProjectId);
    }
    set({ ready: true });
  },

  completeOnboarding: async ({
    apiConfig,
    language,
    domain,
    design,
    projectTitle,
    userId = null,
    userEmail = null,
  }) => {
    const project: Project = {
      id: uid(),
      title: projectTitle || "未命名项目",
      domain,
      design,
      schema_version: SCHEMA_VERSION,
      created_at: now(),
      updated_at: now(),
    };
    await db.putProject(project);
    await Promise.all([
      db.setSetting("apiConfig", apiConfig),
      db.setSetting("language", language),
      db.setSetting("onboarded", true),
      db.setSetting("activeProjectId", project.id),
      db.setSetting("userId", userId),
      db.setSetting("userEmail", userEmail),
    ]);
    set({
      apiConfig,
      language,
      onboarded: true,
      userId,
      userEmail,
      project,
      nodes: [],
      evidence: [],
      candidates: [],
      library: [],
      selectedNodeId: null,
    });
  },

  loadProject: async (projectId) => {
    const project = await db.getProject(projectId);
    if (!project) return;
    const [nodes, evidence, candidates, library] = await Promise.all([
      db.getNodesByProject(projectId),
      db.getEvidenceByProject(projectId),
      db.getCandidatesByProject(projectId),
      db.getLibraryByProject(projectId),
    ]);
    await db.setSetting("activeProjectId", projectId);
    set({ project, nodes, evidence, candidates, library, selectedNodeId: null });
  },

  refreshProject: async () => {
    const p = get().project;
    if (p) await get().loadProject(p.id);
  },

  addNode: async (partial) => {
    const { project } = get();
    if (!project) throw new Error("无活动项目");
    const node = makeNode(project.id, project.domain, partial);
    await db.putNode(node);
    set((s) => ({ nodes: [...s.nodes, node], selectedNodeId: node.id }));
    return node;
  },

  updateNode: async (id, patch) => {
    const { project, nodes } = get();
    if (!project) return;
    const existing = nodes.find((n) => n.id === id);
    if (!existing) return;
    // 唯一节点更新函数：自动 +1 client_rev、刷新 updated_at、重算 falsifier_status
    const merged: ArgNode = {
      ...existing,
      ...patch,
      updated_at: now(),
      client_rev: existing.client_rev + 1,
    };
    merged.falsifier_status = deriveFalsifierStatus(merged, project.domain);
    await db.putNode(merged);
    set((s) => ({ nodes: s.nodes.map((n) => (n.id === id ? merged : n)) }));
  },

  removeNode: async (id) => {
    const { nodes } = get();
    // 级联：把子节点收养到被删节点的父级（避免整棵子树消失）
    const target = nodes.find((n) => n.id === id);
    const newParent = target?.parent_id ?? null;
    const children = nodes.filter((n) => n.parent_id === id);
    for (const c of children) {
      await get().reparentNode(c.id, newParent);
    }
    await db.deleteNode(id);
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== id),
      evidence: s.evidence.filter((e) => e.node_id !== id),
      selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
    }));
  },

  reparentNode: async (childId, parentId) => {
    if (childId === parentId) return;
    // 防环：parentId 不能是 childId 的后代
    const { nodes } = get();
    if (parentId) {
      let cur: string | null = parentId;
      const byId = new Map(nodes.map((n) => [n.id, n]));
      while (cur) {
        if (cur === childId) return; // 会成环，拒绝
        cur = byId.get(cur)?.parent_id ?? null;
      }
    }
    await get().updateNode(childId, { parent_id: parentId });
  },

  setNodePosition: async (id, x, y) => {
    // 位置变更不算内容变更，直接落库不动 client_rev（避免拖拽刷爆 rev）
    const { nodes } = get();
    const existing = nodes.find((n) => n.id === id);
    if (!existing) return;
    const merged = { ...existing, position: { x, y } };
    await db.putNode(merged);
    set((s) => ({ nodes: s.nodes.map((n) => (n.id === id ? merged : n)) }));
  },

  applyLayout: async (positions) => {
    const { nodes } = get();
    const updated = nodes.map((n) =>
      positions[n.id] ? { ...n, position: positions[n.id] } : n,
    );
    await db.bulkPutNodes(updated);
    set({ nodes: updated });
  },

  selectNode: (id) => set({ selectedNodeId: id }),

  addEvidence: async (e) => {
    const { project } = get();
    if (!project) return;
    const ev: Evidence = {
      ...e,
      id: uid(),
      project_id: project.id,
      created_at: now(),
    };
    await db.putEvidence(ev);
    set((s) => ({ evidence: [...s.evidence, ev] }));
    // 有反证据时把节点状态提示为 challenged（不覆盖 dead）
    if (e.stance === "contradicts") {
      const node = get().nodes.find((n) => n.id === e.node_id);
      if (node && node.status === "open") {
        await get().updateNode(node.id, { status: "challenged" as NodeStatus });
      }
    }
  },

  removeEvidence: async (id) => {
    await db.deleteEvidence(id);
    set((s) => ({ evidence: s.evidence.filter((e) => e.id !== id) }));
  },

  addLibraryItem: async (l) => {
    const { project } = get();
    if (!project) throw new Error("无活动项目");
    const item: LibraryItem = {
      ...l,
      id: uid(),
      project_id: project.id,
      added_at: now(),
    };
    await db.putLibraryItem(item);
    set((s) => ({ library: [...s.library, item] }));
    return item;
  },

  updateLibraryItem: async (id, patch) => {
    const existing = get().library.find((l) => l.id === id);
    if (!existing) return;
    const merged = { ...existing, ...patch };
    await db.putLibraryItem(merged);
    set((s) => ({ library: s.library.map((l) => (l.id === id ? merged : l)) }));
  },

  removeLibraryItem: async (id) => {
    await db.deleteLibraryItem(id);
    set((s) => ({ library: s.library.filter((l) => l.id !== id) }));
  },

  addCandidate: async (c) => {
    const { project } = get();
    if (!project) return;
    const cand: Candidate = {
      ...c,
      id: uid(),
      project_id: project.id,
      verdict: "pending",
      created_at: now(),
    };
    await db.putCandidate(cand);
    set((s) => ({ candidates: [...s.candidates, cand] }));
  },

  rejectCandidate: async (id) => {
    const { candidates } = get();
    const c = candidates.find((x) => x.id === id);
    if (!c) return;
    const updated: Candidate = { ...c, verdict: "rejected" };
    await db.putCandidate(updated);
    set((s) => ({ candidates: s.candidates.map((x) => (x.id === id ? updated : x)) }));
  },

  acceptCandidate: async (id) => {
    const { candidates, project } = get();
    const c = candidates.find((x) => x.id === id);
    if (!c || !project) return;
    const content = (c.content ?? {}) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

    if (c.kind === "counter_evidence" && c.target_node_id) {
      // 反证据 → 挂为 stance=contradicts 的证据
      await get().addEvidence({
        node_id: c.target_node_id,
        source_type: "user_reasoning",
        stance: "contradicts",
        strength: typeof content.strength === "number" ? content.strength : 2,
        title: str(content.title) || undefined,
        note: str(content.note) || str(content.issue) || str(content.content) || "红队产出",
      });
    } else {
      // direction / route_diff / 建节点 → 新建节点（挂到目标节点下）
      const schema = getDomain(project.domain);
      const nodeType =
        (str(content.node_type) &&
          schema.nodeTypes.find((t) => t.id === content.node_type)?.id) ||
        schema.nodeTypes[0].id;
      const claim =
        str(content.claim) || str(content.content) || str(content.summary) || "（待补充）";
      await get().addNode({
        claim,
        node_type: nodeType,
        parent_id: c.target_node_id ?? null,
        falsifier: str(content.falsifier) || null,
        position: null,
      });
    }

    const updated: Candidate = { ...c, verdict: "accepted" };
    await db.putCandidate(updated);
    set((s) => ({ candidates: s.candidates.map((x) => (x.id === id ? updated : x)) }));
  },

  setUser: async (userId, email) => {
    await Promise.all([
      db.setSetting("userId", userId),
      db.setSetting("userEmail", email),
    ]);
    set({ userId, userEmail: email });
  },

  requestSearch: (query) => set({ pendingSearch: query }),
  clearPendingSearch: () => set({ pendingSearch: null }),
  requestRedTeam: (nodeId) => set({ pendingRedTeam: nodeId, selectedNodeId: nodeId }),
  clearPendingRedTeam: () => set({ pendingRedTeam: null }),
  openStudy: (libItemId) => set({ studyItemId: libItemId }),
  closeStudy: () => set({ studyItemId: null }),
}));

/** 便捷：当前项目的领域配置。 */
export function useDomainSchema() {
  const project = useAppStore((s) => s.project);
  return project ? getDomain(project.domain) : null;
}
