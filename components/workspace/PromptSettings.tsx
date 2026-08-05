"use client";

import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "@/lib/store";
import { DOMAIN_ORDER, getDomain } from "@/lib/domains";
import {
  PROMPT_FIELDS,
  defaultTemplate,
  isCustomized,
  type PromptKey,
} from "@/lib/promptTemplates";
import type { Domain } from "@/lib/db/schema";

/**
 * 提示词模板设置（按课题分类）。
 * 用户可逐字段编辑并「还原」成默认模板；只保存改过的字段，未改的跟随默认演进。
 * JSON 输出契约不在此暴露——由代码追加，避免用户改坏 schema 导致候选区解析失败。
 */
export default function PromptSettings({ onClose }: { onClose: () => void }) {
  const project = useAppStore((s) => s.project);
  const promptOverrides = useAppStore((s) => s.promptOverrides);
  const setPrompt = useAppStore((s) => s.setPrompt);
  const resetPrompt = useAppStore((s) => s.resetPrompt);
  const resetDomainPrompts = useAppStore((s) => s.resetDomainPrompts);

  const [domain, setDomain] = useState<Domain>(
    (project?.domain ?? "general") as Domain,
  );
  const defaults = useMemo(() => defaultTemplate(domain), [domain]);
  const ov = promptOverrides[domain] ?? {};

  const customCount = (Object.keys(ov) as PromptKey[]).filter((k) =>
    isCustomized(domain, k, promptOverrides),
  ).length;

  const groups = ["角色", "对话调用", "研读"] as const;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg-void/80 p-4">
      <div className="flex h-full max-h-[90vh] w-full max-w-3xl flex-col rounded-sm border border-border bg-bg-surface">
        {/* 顶栏 */}
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <div>
            <span className="font-sans text-sm text-fg-primary">提示词模板</span>
            <p className="label-mono mt-0.5 text-fg-tertiary">
              按课题分类配置 AI 互动 · 可编辑与还原
            </p>
          </div>
          <button
            onClick={onClose}
            className="label-mono rounded-sm border border-border px-3 py-1 text-fg-secondary hover:bg-bg-hover hover:text-fg-primary"
          >
            ✕ 关闭
          </button>
        </div>

        {/* 课题分类切换 */}
        <div className="flex flex-wrap items-center gap-1 border-b border-border px-4 py-2">
          {DOMAIN_ORDER.map((d) => {
            const n = Object.keys(promptOverrides[d] ?? {}).length;
            return (
              <button
                key={d}
                onClick={() => setDomain(d)}
                className={`label-mono rounded-sm px-2.5 py-1 ${
                  domain === d
                    ? "bg-bg-raised text-fg-primary"
                    : "text-fg-tertiary hover:bg-bg-hover hover:text-fg-secondary"
                }`}
              >
                {getDomain(d).label}
                {n > 0 ? ` ·${n}` : ""}
              </button>
            );
          })}
          {customCount > 0 && (
            <button
              onClick={() => {
                if (confirm(`还原「${getDomain(domain).label}」的全部提示词为默认模板？`))
                  resetDomainPrompts(domain);
              }}
              className="label-mono ml-auto rounded-sm border border-border px-2 py-0.5 text-fg-tertiary hover:text-contradict"
            >
              ↺ 全部还原
            </button>
          )}
        </div>

        {/* 字段列表 */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <p className="label-mono mb-3 text-fg-tertiary">
            提示：JSON 输出格式由程序自动追加，不在此编辑——保证候选区能正确解析。
          </p>
          {groups.map((g) => (
            <div key={g} className="mb-5">
              <p className="label-mono mb-2 text-fg-secondary">{g}</p>
              {PROMPT_FIELDS.filter((f) => f.group === g).map((f) => (
                <PromptField
                  key={f.key}
                  label={f.label}
                  hint={f.hint}
                  rows={f.rows}
                  value={ov[f.key] ?? defaults[f.key]}
                  customized={isCustomized(domain, f.key, promptOverrides)}
                  onSave={(v) => setPrompt(domain, f.key, v)}
                  onReset={() => resetPrompt(domain, f.key)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PromptField({
  label,
  hint,
  rows,
  value,
  customized,
  onSave,
  onReset,
}: {
  label: string;
  hint: string;
  rows: number;
  value: string;
  customized: boolean;
  onSave: (v: string) => void;
  onReset: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);

  // 外部值变化（切换领域 / 还原）时同步草稿，用户正在编辑时不打断
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const dirty = draft !== value;

  return (
    <div className="mb-3 rounded-sm border border-border bg-bg-void p-2.5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-sans text-xs text-fg-primary">
          {label}
          {customized && (
            <span className="label-mono ml-2 text-fg-tertiary">已自定义</span>
          )}
        </span>
        <div className="flex items-center gap-1">
          {dirty && (
            <button
              onClick={() => {
                onSave(draft);
                setEditing(false);
              }}
              className="label-mono rounded-sm border border-border bg-bg-raised px-2 py-0.5 text-fg-primary hover:bg-bg-hover"
            >
              保存
            </button>
          )}
          {(customized || dirty) && (
            <button
              onClick={() => {
                setEditing(false);
                onReset();
              }}
              title="还原成默认模板"
              className="label-mono rounded-sm border border-border px-2 py-0.5 text-fg-tertiary hover:text-fg-primary"
            >
              ↺ 还原
            </button>
          )}
        </div>
      </div>
      <p className="label-mono mb-1.5 text-fg-tertiary">{hint}</p>
      <textarea
        value={draft}
        rows={rows}
        onFocus={() => setEditing(true)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => {
          setEditing(false);
          if (e.target.value !== value) onSave(e.target.value);
        }}
        className="w-full resize-y rounded-sm border border-border bg-bg-surface px-2 py-1.5 font-sans text-xs leading-relaxed text-fg-secondary outline-none focus:border-border-focus"
      />
    </div>
  );
}
