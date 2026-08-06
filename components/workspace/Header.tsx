"use client";

import { useMemo, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { getDomain } from "@/lib/domains";
import { computeMaturity } from "@/lib/methodology";
import { downloadProject, importProject } from "@/lib/db/export-import";
import { getSupabase, sendPasswordReset } from "@/lib/supabase/client";
import { pushProject, pullProject, listRemoteProjects } from "@/lib/supabase/sync";
import { clearAll } from "@/lib/db/storage";
import PromptSettings from "./PromptSettings";
import type { Domain } from "@/lib/db/schema";

/**
 * 顶栏（§6.0）：项目名 · 领域 · 健康度 · 导入/导出 · 设置 · 退出。
 * 导入导出是 Phase 1 验收判据的关键（约束五）。
 */
export default function Header() {
  const { t } = useI18n();
  const project = useAppStore((s) => s.project);
  const nodes = useAppStore((s) => s.nodes);
  const evidence = useAppStore((s) => s.evidence);
  const userEmail = useAppStore((s) => s.userEmail);
  const loadProject = useAppStore((s) => s.loadProject);
  const fileInput = useRef<HTMLInputElement>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [promptsOpen, setPromptsOpen] = useState(false);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);

  const domain = (project?.domain ?? "general") as Domain;

  // 健康度（§6.0 头部百分比）：经验节点有 falsifier 的比例 + 节点有证据的比例的平均。
  const health = useMemo(() => {
    const m = computeMaturity(nodes, evidence, domain);
    if (m.nodeCount === 0) return 0;
    const falsifiablePart =
      m.unfalsifiable.empiricalTotal === 0
        ? 1
        : 1 - m.unfalsifiable.count / m.unfalsifiable.empiricalTotal;
    const evidencePart = 1 - m.noEvidenceNodes / m.nodeCount;
    return Math.round(((falsifiablePart + evidencePart) / 2) * 100);
  }, [nodes, evidence, domain]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function onExport() {
    if (!project) return;
    await downloadProject(project.id, project.title);
    flash(t.importExport.exportDone);
  }

  async function onImportFile(file: File) {
    try {
      const text = await file.text();
      const res = await importProject(text);
      await loadProject(res.projectId);
      flash(
        res.checksumOk
          ? t.importExport.importSuccess(res.nodeCount)
          : t.importExport.importChecksumFail,
      );
    } catch (e) {
      flash(`${t.importExport.importFail}: ${e instanceof Error ? e.message : e}`);
    }
  }

  async function onPush() {
    if (!project) return;
    setMenuOpen(false);
    flash("同步中…");
    const r = await pushProject(project.id);
    flash(r.message);
  }

  async function onPull() {
    setMenuOpen(false);
    flash("拉取中…");
    const remote = await listRemoteProjects();
    if (remote.length === 0) {
      flash("云端无项目或不可达");
      return;
    }
    // 优先拉取与当前同 id 的项目，否则拉最新的一个
    const target = remote.find((p) => p.id === project?.id) ?? remote[0];
    const r = await pullProject(target.id);
    if (r.ok) await loadProject(target.id);
    flash(r.message);
  }

  // 已登录用户在应用内重置密码：向账号邮箱发验证邮件（登录界面只在引导时出现）
  async function onResetPassword() {
    if (!userEmail) return;
    setMenuOpen(false);
    flash("发送中…");
    try {
      await sendPasswordReset(userEmail);
      flash(`重置邮件已发送至 ${userEmail}，请查收（含垃圾箱）。`);
    } catch (e) {
      flash(`发送失败：${e instanceof Error ? e.message : e}`);
    }
  }

  async function onLogout(clearLocal: boolean) {
    const supabase = getSupabase();
    if (supabase) await supabase.auth.signOut();
    if (clearLocal) await clearAll();
    window.location.reload();
  }

  const healthColor =
    health >= 80 ? "text-fg-primary" : health < 40 ? "text-contradict" : "text-fg-secondary";

  return (
    <header className="relative flex items-center justify-between border-b border-border bg-bg-surface px-4 py-2">
      <div className="flex items-center gap-4">
        <span className="font-sans text-sm text-fg-primary">{project?.title}</span>
        <span className="label-mono text-fg-tertiary">{getDomain(domain).label}</span>
      </div>

      <div className="flex items-center gap-3">
        <span
          className={`label-mono ${healthColor}`}
          title={
            health >= 80
              ? "全绿只意味着报告完整，不意味着研究重要——该找人评审了"
              : t.maturity.healthTitle
          }
        >
          {t.workspace.health} {health}%
        </span>

        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onImportFile(f);
            e.target.value = "";
          }}
        />
        <button
          onClick={() => fileInput.current?.click()}
          className="label-mono rounded-sm border border-border px-2 py-1 text-fg-secondary hover:bg-bg-hover hover:text-fg-primary"
        >
          ⬆ {t.common.import}
        </button>
        <button
          onClick={onExport}
          disabled={!project}
          className="label-mono rounded-sm border border-border px-2 py-1 text-fg-secondary hover:bg-bg-hover hover:text-fg-primary disabled:opacity-40"
        >
          ⬇ {t.common.export}
        </button>

        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          title={theme === "dark" ? "切换到亮白系" : "切换到暗黑系"}
          className="label-mono rounded-sm border border-border px-2 py-1 text-fg-secondary hover:bg-bg-hover hover:text-fg-primary"
        >
          {theme === "dark" ? "☾ 暗黑" : "☀ 亮白"}
        </button>

        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="label-mono rounded-sm border border-border px-2 py-1 text-fg-secondary hover:bg-bg-hover hover:text-fg-primary"
        >
          ⚙
        </button>

        {menuOpen && (
          <div className="absolute right-4 top-12 z-20 w-56 rounded-sm border border-border bg-bg-surface p-2 shadow-lg">
            <p className="label-mono px-2 py-1 text-fg-tertiary">
              {userEmail ?? "本地模式（未登录）"}
            </p>
            <button
              onClick={() => {
                setPromptsOpen(true);
                setMenuOpen(false);
              }}
              className="label-mono block w-full rounded-sm px-2 py-1 text-left text-fg-secondary hover:bg-bg-hover"
            >
              ✎ 提示词模板
            </button>
            <div className="my-1 border-t border-border" />
            {userEmail && (
              <>
                <button
                  onClick={onPush}
                  className="label-mono block w-full rounded-sm px-2 py-1 text-left text-fg-secondary hover:bg-bg-hover"
                >
                  ☁ 上传到云端
                </button>
                <button
                  onClick={onPull}
                  className="label-mono block w-full rounded-sm px-2 py-1 text-left text-fg-secondary hover:bg-bg-hover"
                >
                  ⬇ 从云端拉取
                </button>
                <button
                  onClick={onResetPassword}
                  title="向账号邮箱发送重置密码验证邮件"
                  className="label-mono block w-full rounded-sm px-2 py-1 text-left text-fg-secondary hover:bg-bg-hover"
                >
                  ✉ 重置密码
                </button>
                <div className="my-1 border-t border-border" />
              </>
            )}
            <button
              onClick={() => onLogout(false)}
              className="label-mono block w-full rounded-sm px-2 py-1 text-left text-fg-secondary hover:bg-bg-hover"
            >
              {t.common.logout}
            </button>
            <button
              onClick={() => {
                if (confirm("清除本地全部数据？此操作不可撤销。")) onLogout(true);
              }}
              className="label-mono block w-full rounded-sm px-2 py-1 text-left text-contradict hover:bg-contradict/10"
            >
              清除本地数据
            </button>
          </div>
        )}
      </div>

      {promptsOpen && <PromptSettings onClose={() => setPromptsOpen(false)} />}

      {toast && (
        <div className="absolute left-1/2 top-12 z-30 -translate-x-1/2 rounded-sm border border-border bg-bg-raised px-3 py-1.5">
          <span className="label-mono text-fg-primary">{toast}</span>
        </div>
      )}
    </header>
  );
}
