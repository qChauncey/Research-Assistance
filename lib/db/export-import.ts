/**
 * 导入导出 (§4.1) —— 约束五：必须在 Phase 1。
 * 它反向约束整个数据模型：整棵树必须在客户端可完整重建。
 *
 * Phase 1 验收判据的最后一环：导出 JSON → 刷新 → 重新导入 → 树完整还原。
 */
import { SCHEMA_VERSION } from "./schema";
import type { Project, ArgNode, Evidence, Candidate, LibraryItem } from "./schema";
import { migrateToLatest, type ExportPayload } from "./migrations";
import {
  getProject,
  getNodesByProject,
  getEvidenceByProject,
  getCandidatesByProject,
  getLibraryByProject,
  putProject,
  bulkPutNodes,
  putEvidence,
  putCandidate,
  putLibraryItem,
} from "./storage";

const FORMAT = "argument-tree/v1";

/** 对规范化后的 JSON 文本算 sha256，返回 "sha256:..." 形式。 */
async function computeChecksum(text: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    const hex = Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return `sha256:${hex}`;
  }
  return "sha256:unavailable";
}

export interface ExportBundle extends ExportPayload {
  project: Project;
  nodes: ArgNode[];
  evidence: Evidence[];
  candidates: Candidate[];
  library_items: LibraryItem[];
}

/** 从本地存储组装一个自包含的导出对象。 */
export async function buildExport(projectId: string): Promise<ExportBundle> {
  const project = await getProject(projectId);
  if (!project) throw new Error("项目不存在");

  const [nodes, evidence, candidates, library_items] = await Promise.all([
    getNodesByProject(projectId),
    getEvidenceByProject(projectId),
    getCandidatesByProject(projectId),
    getLibraryByProject(projectId),
  ]);

  const base = {
    format: FORMAT,
    schema_version: SCHEMA_VERSION,
    exported_at: new Date().toISOString(),
    project,
    nodes,
    evidence,
    candidates: candidates.filter((c) => c.verdict === "pending"), // 只导出未决候选
    library_items,
    papers_cache: [] as unknown[], // Phase 1 无公共缓存
  };

  // checksum 覆盖除自身外的全部内容
  const checksum = await computeChecksum(JSON.stringify(base));
  return { ...base, checksum };
}

/** 导出为 JSON 字符串（供下载）。 */
export async function exportProjectJSON(projectId: string): Promise<string> {
  const bundle = await buildExport(projectId);
  return JSON.stringify(bundle, null, 2);
}

/** 触发浏览器下载。 */
export async function downloadProject(projectId: string, title: string) {
  const json = await exportProjectJSON(projectId);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safe = title.replace(/[^\w一-龥-]+/g, "_").slice(0, 40) || "project";
  a.href = url;
  a.download = `${safe}.argtree.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export interface ImportResult {
  projectId: string;
  nodeCount: number;
  checksumOk: boolean;
}

/**
 * 解析并写入本地存储。先跑迁移（把旧 schema_version 升到当前），再校验 checksum。
 * 冲突处理（§4.2 的节点级 last-write-wins）在 Phase 2 联网同步时才涉及；
 * Phase 1 纯离线导入直接覆盖同 id 的项目。
 */
export async function importProject(jsonText: string): Promise<ImportResult> {
  let parsed: ExportPayload;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("文件不是合法 JSON");
  }

  if (parsed.format !== FORMAT) {
    throw new Error(`未知格式：${String(parsed.format)}`);
  }

  const migrated = migrateToLatest(parsed) as ExportBundle;

  // 校验 checksum（去掉 checksum 字段后重算）
  let checksumOk = true;
  if (migrated.checksum) {
    const { checksum, ...rest } = migrated;
    const recomputed = await computeChecksum(JSON.stringify(rest));
    checksumOk = recomputed === checksum;
  }

  const project = migrated.project;
  if (!project?.id) throw new Error("导入文件缺少 project");

  // 确保 schema_version 落到当前
  project.schema_version = SCHEMA_VERSION;

  await putProject(project);
  await bulkPutNodes(migrated.nodes ?? []);
  await Promise.all([
    ...(migrated.evidence ?? []).map((e) => putEvidence(e)),
    ...(migrated.candidates ?? []).map((c) => putCandidate(c)),
    ...(migrated.library_items ?? []).map((l) => putLibraryItem(l)),
  ]);

  return {
    projectId: project.id,
    nodeCount: (migrated.nodes ?? []).length,
    checksumOk,
  };
}
