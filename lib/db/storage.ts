/**
 * 纯离线持久化层 (§4.3) —— 全部状态存 IndexedDB（用 idb 库，不用 localStorage：
 * 树 + 证据可能超 5MB）。
 *
 * object store 一比一对应 §2 的表：projects / nodes / evidence / candidates /
 * library_items，外加一个 meta store 存全局设置（API 配置、语言、当前项目）。
 */
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type {
  Project,
  ArgNode,
  Evidence,
  Candidate,
  LibraryItem,
  ApiConfig,
  LanguageConfig,
} from "./schema";
import type { PromptOverrides } from "../promptTemplates";

const DB_NAME = "argument-tree";
const DB_VERSION = 1;

interface ArgTreeDB extends DBSchema {
  projects: { key: string; value: Project };
  nodes: {
    key: string;
    value: ArgNode;
    indexes: { by_project: string; by_parent: string };
  };
  evidence: {
    key: string;
    value: Evidence;
    indexes: { by_project: string; by_node: string };
  };
  candidates: {
    key: string;
    value: Candidate;
    indexes: { by_project: string };
  };
  library_items: {
    key: string;
    value: LibraryItem;
    indexes: { by_project: string };
  };
  meta: { key: string; value: unknown };
}

let dbPromise: Promise<IDBPDatabase<ArgTreeDB>> | null = null;

function getDB(): Promise<IDBPDatabase<ArgTreeDB>> {
  if (typeof window === "undefined") {
    throw new Error("IndexedDB 仅在浏览器可用");
  }
  if (!dbPromise) {
    dbPromise = openDB<ArgTreeDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore("projects", { keyPath: "id" });

        const nodes = db.createObjectStore("nodes", { keyPath: "id" });
        nodes.createIndex("by_project", "project_id");
        nodes.createIndex("by_parent", "parent_id");

        const evidence = db.createObjectStore("evidence", { keyPath: "id" });
        evidence.createIndex("by_project", "project_id");
        evidence.createIndex("by_node", "node_id");

        const candidates = db.createObjectStore("candidates", { keyPath: "id" });
        candidates.createIndex("by_project", "project_id");

        const library = db.createObjectStore("library_items", { keyPath: "id" });
        library.createIndex("by_project", "project_id");

        db.createObjectStore("meta");
      },
    });
  }
  return dbPromise;
}

// —— 项目 ——
export async function putProject(p: Project) {
  return (await getDB()).put("projects", p);
}
export async function getProject(id: string) {
  return (await getDB()).get("projects", id);
}
export async function getAllProjects(): Promise<Project[]> {
  return (await getDB()).getAll("projects");
}
export async function deleteProject(id: string) {
  const db = await getDB();
  const tx = db.transaction(
    ["projects", "nodes", "evidence", "candidates", "library_items"],
    "readwrite",
  );
  await tx.objectStore("projects").delete(id);
  for (const store of ["nodes", "evidence", "candidates", "library_items"] as const) {
    const idx = tx.objectStore(store).index("by_project");
    let cursor = await idx.openCursor(id);
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
  }
  await tx.done;
}

// —— 节点 ——
export async function putNode(n: ArgNode) {
  return (await getDB()).put("nodes", n);
}
export async function bulkPutNodes(nodes: ArgNode[]) {
  const db = await getDB();
  const tx = db.transaction("nodes", "readwrite");
  await Promise.all(nodes.map((n) => tx.store.put(n)));
  await tx.done;
}
export async function getNodesByProject(projectId: string): Promise<ArgNode[]> {
  return (await getDB()).getAllFromIndex("nodes", "by_project", projectId);
}
export async function deleteNode(id: string) {
  const db = await getDB();
  const tx = db.transaction(["nodes", "evidence"], "readwrite");
  await tx.objectStore("nodes").delete(id);
  // 级联删除挂在该节点上的证据（对应 SQL on delete cascade）
  const idx = tx.objectStore("evidence").index("by_node");
  let cursor = await idx.openCursor(id);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

// —— 证据 ——
export async function putEvidence(e: Evidence) {
  return (await getDB()).put("evidence", e);
}
export async function getEvidenceByProject(projectId: string): Promise<Evidence[]> {
  return (await getDB()).getAllFromIndex("evidence", "by_project", projectId);
}
export async function getEvidenceByNode(nodeId: string): Promise<Evidence[]> {
  return (await getDB()).getAllFromIndex("evidence", "by_node", nodeId);
}
export async function deleteEvidence(id: string) {
  return (await getDB()).delete("evidence", id);
}

// —— 候选区 ——
export async function putCandidate(c: Candidate) {
  return (await getDB()).put("candidates", c);
}
export async function getCandidatesByProject(projectId: string): Promise<Candidate[]> {
  return (await getDB()).getAllFromIndex("candidates", "by_project", projectId);
}

// —— 文献库 ——
export async function putLibraryItem(l: LibraryItem) {
  return (await getDB()).put("library_items", l);
}
export async function getLibraryByProject(projectId: string): Promise<LibraryItem[]> {
  return (await getDB()).getAllFromIndex("library_items", "by_project", projectId);
}
export async function deleteLibraryItem(id: string) {
  return (await getDB()).delete("library_items", id);
}

// —— meta（全局设置） ——
export interface AppSettings {
  apiConfig?: ApiConfig;
  language?: LanguageConfig;
  activeProjectId?: string;
  onboarded?: boolean;
  /** 登录用户 id（Supabase）或 null（纯离线） */
  userId?: string | null;
  userEmail?: string | null;
  /** 界面主题：暗黑系 / 亮白系 */
  theme?: "dark" | "light";
  /** 按课题分类的提示词覆盖（只存用户改过的字段） */
  promptOverrides?: PromptOverrides;
}

export async function getSetting<K extends keyof AppSettings>(
  key: K,
): Promise<AppSettings[K] | undefined> {
  return (await getDB()).get("meta", key) as Promise<AppSettings[K] | undefined>;
}
export async function setSetting<K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K],
) {
  return (await getDB()).put("meta", value, key);
}

/** 任意键值 meta 读写（用于叙述草稿等按 project 命名的杂项）。 */
export async function getMeta<T = unknown>(key: string): Promise<T | undefined> {
  return (await getDB()).get("meta", key) as Promise<T | undefined>;
}
export async function setMeta(key: string, value: unknown) {
  return (await getDB()).put("meta", value, key);
}

/** 清空全部本地数据（用于"退出并清除本地"）。 */
export async function clearAll() {
  const db = await getDB();
  await Promise.all(
    (
      ["projects", "nodes", "evidence", "candidates", "library_items", "meta"] as const
    ).map((s) => db.clear(s)),
  );
}
