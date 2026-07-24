"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { Button, Input } from "@/components/ui/primitives";
import { suggestStrength } from "@/lib/grade";
import type { EvidenceStance, Domain } from "@/lib/db/schema";

/**
 * 节点证据列表（约束一：反证据与支持证据完全对等，反证据用红色永远可见、不可折叠）。
 * Phase 1 手动添加；Phase 2 才接检索。
 */
export default function EvidenceList({ nodeId }: { nodeId: string }) {
  const { t } = useI18n();
  const allEvidence = useAppStore((s) => s.evidence);
  const evidence = useMemo(
    () => allEvidence.filter((e) => e.node_id === nodeId),
    [allEvidence, nodeId],
  );
  const addEvidence = useAppStore((s) => s.addEvidence);
  const removeEvidence = useAppStore((s) => s.removeEvidence);
  const nodes = useAppStore((s) => s.nodes);
  const project = useAppStore((s) => s.project);
  const domain = (project?.domain ?? "general") as Domain;

  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [stance, setStance] = useState<EvidenceStance>("supports");
  const [strength, setStrength] = useState(3);
  const [note, setNote] = useState("");

  // GRADE 自动建议强度（A.3.2）：按节点设计层级 + 降级情形
  const grade = useMemo(() => {
    const node = nodes.find((n) => n.id === nodeId);
    return node ? suggestStrength(node, domain, "user_reasoning") : null;
  }, [nodes, nodeId, domain]);

  // 打开表单时用建议值预填
  useEffect(() => {
    if (adding && grade) setStrength(grade.suggested);
  }, [adding, grade]);

  async function submit() {
    if (!title.trim() && !note.trim()) return;
    await addEvidence({
      node_id: nodeId,
      source_type: "user_reasoning",
      stance,
      strength,
      title: title.trim() || undefined,
      note: note.trim() || undefined,
    });
    setTitle("");
    setNote("");
    setStance("supports");
    setStrength(3);
    setAdding(false);
  }

  const stanceStyle: Record<EvidenceStance, string> = {
    supports: "text-fg-secondary",
    contradicts: "text-contradict",
    ambiguous: "text-fg-tertiary",
  };
  const stanceLabel: Record<EvidenceStance, string> = {
    supports: t.tree.stanceSupports,
    contradicts: t.tree.stanceContradicts,
    ambiguous: t.tree.stanceAmbiguous,
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="label-mono text-fg-secondary">{t.tree.evidence}</span>
        <button
          onClick={() => setAdding((a) => !a)}
          className="label-mono text-fg-tertiary hover:text-fg-primary"
        >
          ⊕ {t.tree.addEvidence}
        </button>
      </div>

      {evidence.length === 0 && !adding && (
        <p className="text-xs text-fg-tertiary">{t.tree.noEvidence}</p>
      )}

      <ul className="space-y-2">
        {evidence.map((e) => (
          <li
            key={e.id}
            className={`rounded-sm border px-2 py-1.5 ${
              e.stance === "contradicts"
                ? "border-contradict/40 bg-contradict/5"
                : "border-border bg-bg-void"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`label-mono ${stanceStyle[e.stance]}`}>
                    {e.stance === "contradicts" && "● "}
                    {stanceLabel[e.stance]}
                  </span>
                  <span className="label-mono text-fg-tertiary">
                    {"●".repeat(e.strength ?? 0)}
                    {"○".repeat(5 - (e.strength ?? 0))}
                  </span>
                </div>
                {e.title && (
                  <p className="mt-0.5 truncate font-sans text-xs text-fg-primary">
                    {e.title}
                  </p>
                )}
                {e.note && (
                  <p className="mt-0.5 text-xs text-fg-secondary">{e.note}</p>
                )}
              </div>
              <button
                onClick={() => removeEvidence(e.id)}
                className="label-mono shrink-0 text-fg-tertiary hover:text-contradict"
              >
                ✕
              </button>
            </div>
          </li>
        ))}
      </ul>

      {adding && (
        <div className="space-y-2 rounded-sm border border-border bg-bg-void p-2">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="标题 / 来源（可留空）"
          />
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="你的判断 / 摘录"
          />
          <div className="flex gap-1">
            {(["supports", "contradicts", "ambiguous"] as EvidenceStance[]).map(
              (s) => (
                <button
                  key={s}
                  onClick={() => setStance(s)}
                  className={`flex-1 rounded-sm border px-2 py-1 text-xs ${
                    stance === s
                      ? s === "contradicts"
                        ? "border-contradict bg-contradict/10 text-contradict"
                        : "border-fg-primary bg-fg-primary/10 text-fg-primary"
                      : "border-border text-fg-tertiary hover:bg-bg-hover"
                  }`}
                >
                  {stanceLabel[s]}
                </button>
              ),
            )}
          </div>
          {grade && domain === "experimental" && (
            <div className="rounded-sm border border-border bg-bg-surface px-2 py-1">
              <p className="label-mono text-fg-tertiary">
                GRADE 建议 {grade.suggested}（{grade.baseReason}
                {grade.base !== grade.suggested ? `，基线 ${grade.base}` : ""}）
              </p>
              {grade.downgrades.length > 0 && (
                <p className="label-mono text-contradict">
                  降级：{grade.downgrades.join(" · ")}
                </p>
              )}
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="label-mono text-fg-tertiary">{t.tree.strength}</span>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setStrength(n)}
                className={`h-6 w-6 rounded-sm border text-xs ${
                  strength === n
                    ? "border-fg-primary bg-fg-primary/20 text-fg-primary"
                    : "border-border text-fg-tertiary hover:bg-bg-hover"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setAdding(false)}>{t.common.cancel}</Button>
            <Button variant="primary" onClick={submit}>
              {t.common.add}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
