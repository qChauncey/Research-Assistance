"use client";

/**
 * 云端同步（Phase 2）—— 把活动项目在 IndexedDB 与 Supabase 之间搬运。
 *
 * 设计遵循技术文档：数据形状与本地一致（§2 读法），同步层只是搬运，不改形状。
 * Phase 1 的离线优先是地基：任何同步失败都不能破坏本地体验，因此全部包在 try/catch，
 * 失败只返回错误信息，绝不抛到 UI 顶层。
 *
 * 冲突处理（§4.2 的节点级 last-write-wins + 冲突副本）是更完整的 Phase 2 工作；
 * 此处先实现最小可用：按 id upsert（推）与整项目拉取（拉），以 updated_at 为准。
 *
 * ⚠ 需先在 Supabase SQL Editor 执行 supabase/migrations/0001_init.sql 建表，
 *   且运行环境需允许出站到 *.supabase.co（本地沙箱网络策略会拦截，Vercel 部署正常）。
 */
import { getSupabase } from "./client";
import type { Project, ArgNode, Evidence, Candidate, LibraryItem } from "@/lib/db/schema";
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
} from "@/lib/db/storage";

export interface SyncResult {
  ok: boolean;
  message: string;
}

async function currentUserId(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** 把本地活动项目推到云端（upsert）。 */
export async function pushProject(projectId: string): Promise<SyncResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, message: "未配置云端" };
  const uid = await currentUserId();
  if (!uid) return { ok: false, message: "未登录，无法同步" };

  try {
    const project = await getProject(projectId);
    if (!project) return { ok: false, message: "本地项目不存在" };

    const [nodes, evidence, candidates, library] = await Promise.all([
      getNodesByProject(projectId),
      getEvidenceByProject(projectId),
      getCandidatesByProject(projectId),
      getLibraryByProject(projectId),
    ]);

    // 项目必须带 owner_id 以过 RLS
    const projRow = { ...project, owner_id: uid };
    const up = await supabase.from("projects").upsert(projRow);
    if (up.error) throw up.error;

    // 先父后子对 nodes 无强约束（parent 同批 upsert），逐表 upsert
    if (nodes.length) {
      const r = await supabase.from("nodes").upsert(nodes);
      if (r.error) throw r.error;
    }
    if (evidence.length) {
      const r = await supabase.from("evidence").upsert(evidence);
      if (r.error) throw r.error;
    }
    if (candidates.length) {
      const r = await supabase.from("candidates").upsert(candidates);
      if (r.error) throw r.error;
    }
    if (library.length) {
      const r = await supabase.from("library_items").upsert(library);
      if (r.error) throw r.error;
    }

    return { ok: true, message: `已上传：${nodes.length} 节点` };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

/** 列出云端属于当前用户的项目（用于登录后选择拉取）。 */
export async function listRemoteProjects(): Promise<Project[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as Project[];
  } catch {
    return [];
  }
}

/** 从云端拉取指定项目的全部数据写入本地 IndexedDB（覆盖同 id）。 */
export async function pullProject(projectId: string): Promise<SyncResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, message: "未配置云端" };
  const uid = await currentUserId();
  if (!uid) return { ok: false, message: "未登录，无法同步" };

  try {
    const [proj, nodes, evidence, candidates, library] = await Promise.all([
      supabase.from("projects").select("*").eq("id", projectId).single(),
      supabase.from("nodes").select("*").eq("project_id", projectId),
      supabase.from("evidence").select("*").eq("project_id", projectId),
      supabase.from("candidates").select("*").eq("project_id", projectId),
      supabase.from("library_items").select("*").eq("project_id", projectId),
    ]);
    if (proj.error) throw proj.error;

    // 落库时去掉云端专有的 owner_id，保持本地形状
    const { owner_id: _owner, ...projectLocal } = proj.data as Project & {
      owner_id?: string;
    };
    await putProject(projectLocal as Project);
    await bulkPutNodes((nodes.data ?? []) as ArgNode[]);
    await Promise.all([
      ...((evidence.data ?? []) as Evidence[]).map((e) => putEvidence(e)),
      ...((candidates.data ?? []) as Candidate[]).map((c) => putCandidate(c)),
      ...((library.data ?? []) as LibraryItem[]).map((l) => putLibraryItem(l)),
    ]);

    return { ok: true, message: `已拉取：${(nodes.data ?? []).length} 节点` };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

function errMsg(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) {
    const m = String((e as { message: unknown }).message);
    // 表不存在时给出可操作提示
    if (/relation .* does not exist|schema cache/i.test(m)) {
      return "云端未建表：请先在 Supabase SQL Editor 执行 migrations/0001_init.sql";
    }
    return m;
  }
  return String(e);
}
