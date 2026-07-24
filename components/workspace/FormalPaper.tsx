"use client";

import { useMemo, useState } from "react";
import { useAppStore } from "@/lib/store";
import type { Domain } from "@/lib/db/schema";
import {
  buildPaper,
  paperToMarkdown,
  paperToLatex,
  evidenceToBibtex,
} from "@/lib/paper";
import { evaluateChecklist, checklistToMarkdown } from "@/lib/checklists";
import { getDomain } from "@/lib/domains";
import { downloadText, safeName } from "@/lib/download";
import { Button } from "@/components/ui/primitives";

/**
 * 正式论文模式（§6.4.2）。从树快照式生成论文骨架并填充；导出 Markdown/LaTeX/BibTeX；
 * 实验科学 + 已选研究设计时可导出对应报告规范清单（CONSORT/PRISMA/…）。
 */
export default function FormalPaper() {
  const project = useAppStore((s) => s.project);
  const nodes = useAppStore((s) => s.nodes);
  const evidence = useAppStore((s) => s.evidence);
  const [nonce, setNonce] = useState(0); // 手动刷新（快照式，非双向同步）

  const domain = (project?.domain ?? "general") as Domain;
  const schema = getDomain(domain);

  const paper = useMemo(
    () => (project ? buildPaper(project, nodes, evidence, domain) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project, nodes, evidence, domain, nonce],
  );

  // 清单绑定（实验科学按 design）
  const checklistStandard = useMemo(() => {
    if (domain !== "experimental" || !project?.design) return null;
    return schema.checklistBinding?.[project.design] ?? null;
  }, [domain, project?.design, schema]);

  const checklist = useMemo(
    () => (checklistStandard ? evaluateChecklist(checklistStandard, nodes) : null),
    [checklistStandard, nodes],
  );

  if (!project || !paper) {
    return <div className="px-5 py-4 text-xs text-fg-tertiary">无项目。</div>;
  }

  const base = safeName(project.title);

  return (
    <div className="flex h-full flex-col">
      {/* 工具条 */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        <Button onClick={() => setNonce((n) => n + 1)}>⟳ 重新生成</Button>
        <span className="mx-1 h-4 w-px bg-border" />
        <Button
          onClick={() =>
            downloadText(`${base}.md`, paperToMarkdown(paper), "text/markdown")
          }
        >
          ⬇ Markdown
        </Button>
        <Button
          onClick={() =>
            downloadText(
              `${base}.tex`,
              paperToLatex(paper, evidence),
              "application/x-tex",
            )
          }
        >
          ⬇ LaTeX
        </Button>
        <Button
          onClick={() => downloadText(`${base}.bib`, evidenceToBibtex(evidence), "text/plain")}
          disabled={!evidence.some((e) => e.title || e.doi)}
        >
          ⬇ BibTeX
        </Button>
        {checklist && (
          <Button
            variant="primary"
            onClick={() =>
              downloadText(
                `${base}.${checklist.def.standard}.md`,
                checklistToMarkdown(checklist),
                "text/markdown",
              )
            }
          >
            ⬇ {checklist.def.standard} 清单
          </Button>
        )}
      </div>

      {/* 预览 */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <h1 className="mb-1 font-sans text-lg text-fg-primary">{paper.title}</h1>
        <p className="label-mono mb-4 text-fg-tertiary">
          {schema.label} · 骨架：{paper.sections.map((s) => s.heading).join(" · ")}
        </p>

        {paper.warnings.length > 0 && (
          <div className="mb-4 rounded-sm border border-contradict/40 bg-contradict/5 p-3">
            <p className="label-mono mb-1 text-contradict">
              草稿标黄 {paper.warnings.length} 处（缺可证伪条件）
            </p>
            <ul className="space-y-0.5 text-xs text-fg-secondary">
              {paper.warnings.slice(0, 6).map((w, i) => (
                <li key={i}>· {w}</li>
              ))}
            </ul>
          </div>
        )}

        {paper.sections.map((s) => (
          <section key={s.heading} className="mb-5">
            <h2 className="mb-1 border-b border-border pb-1 font-sans text-sm text-fg-primary">
              {s.heading}
            </h2>
            <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-fg-secondary">
              {s.body}
            </pre>
          </section>
        ))}

        {/* 清单完成度预览 */}
        {checklist && (
          <section className="mb-5">
            <h2 className="mb-1 border-b border-border pb-1 font-sans text-sm text-fg-primary">
              {checklist.def.label} · 完成度 {checklist.completeness.done}/
              {checklist.completeness.total}
            </h2>
            <ul className="space-y-0.5 text-xs">
              {checklist.rows.map((r) => (
                <li
                  key={r.item.id}
                  className={r.done ? "text-fg-secondary" : "text-fg-tertiary"}
                >
                  {r.done ? "✓" : "☐"} {r.item.section} — {r.item.text}
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="mt-6 text-xs text-fg-tertiary">
          快照式生成：改动树后点「重新生成」刷新。反证据自动进 Limitations，删除需主动操作。
        </p>
      </div>
    </div>
  );
}
