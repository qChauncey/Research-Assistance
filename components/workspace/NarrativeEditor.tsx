"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "@/lib/store";
import { getMeta, setMeta } from "@/lib/db/storage";

/**
 * 叙述模式（§6.4.1）。基础富文本 + 节点引用(@) + 文献引用([[)。
 * 引用以 token 形式插入：`@{命题片段}` / `[[标题]]`。
 * 同步指示器：树变化后，若文中引用的节点命题已不匹配，提示「N 处引用可能过时」。
 * 不做实时自动重写——AI 不主动改用户文字（原则三的延伸）。
 */
export default function NarrativeEditor() {
  const project = useAppStore((s) => s.project);
  const nodes = useAppStore((s) => s.nodes);
  const library = useAppStore((s) => s.library);
  const [text, setText] = useState("");
  const [picker, setPicker] = useState<"node" | "ref" | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!project) return;
    if (loadedFor.current === project.id) return;
    loadedFor.current = project.id;
    (async () => setText((await getMeta<string>(`narrative:${project.id}`)) ?? ""))();
  }, [project]);

  function persist(next: string) {
    setText(next);
    if (project) setMeta(`narrative:${project.id}`, next);
  }

  function insertAtCursor(token: string) {
    const ta = taRef.current;
    if (!ta) {
      persist(text + token);
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const next = text.slice(0, start) + token + text.slice(end);
    persist(next);
    setPicker(null);
    // 光标移到插入后
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + token.length;
      ta.setSelectionRange(pos, pos);
    });
  }

  // 同步指示器：文中 @{...} token 若不再匹配任何节点命题 → 过时
  const staleRefs = useMemo(() => {
    const claims = new Set(nodes.map((n) => (n.claim || "").slice(0, 24)));
    const tokens = Array.from(text.matchAll(/@\{([^}]+)\}/g)).map((m) => m[1]);
    return tokens.filter((frag) => !claims.has(frag)).length;
  }, [text, nodes]);

  return (
    <div className="flex h-full flex-col">
      {/* 引用工具条 */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-1.5">
        <button
          onClick={() => setPicker(picker === "node" ? null : "node")}
          className="label-mono rounded-sm border border-border px-2 py-0.5 text-fg-secondary hover:bg-bg-hover hover:text-fg-primary"
        >
          @ 节点引用
        </button>
        <button
          onClick={() => setPicker(picker === "ref" ? null : "ref")}
          className="label-mono rounded-sm border border-border px-2 py-0.5 text-fg-secondary hover:bg-bg-hover hover:text-fg-primary"
        >
          [[ 文献引用
        </button>
        {staleRefs > 0 && (
          <span className="label-mono text-contradict">
            树已更新，{staleRefs} 处引用可能过时
          </span>
        )}
      </div>

      {/* 选择器 */}
      {picker === "node" && (
        <PickerList
          empty="暂无节点"
          items={nodes.map((n) => ({
            key: n.id,
            label: n.claim || "（空命题）",
            token: `@{${(n.claim || "").slice(0, 24)}}`,
          }))}
          onPick={insertAtCursor}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === "ref" && (
        <PickerList
          empty="文献库为空（左栏检索或上传）"
          items={library.map((l) => ({
            key: l.id,
            label: `${l.title}${l.fulltext_status === "metadata_only" ? " ○仅元数据" : ""}`,
            token: `[[${l.title}]]`,
          }))}
          onPick={insertAtCursor}
          onClose={() => setPicker(null)}
        />
      )}

      <textarea
        ref={taRef}
        value={text}
        onChange={(e) => persist(e.target.value)}
        placeholder="把树里的结构写成人话…（@ 引用节点 · [[ 引用文献）"
        className="min-h-0 flex-1 resize-none bg-bg-void px-5 py-4 font-sans text-sm leading-relaxed text-fg-primary outline-none placeholder:text-fg-tertiary"
      />
    </div>
  );
}

function PickerList({
  items,
  onPick,
  onClose,
  empty,
}: {
  items: { key: string; label: string; token: string }[];
  onPick: (token: string) => void;
  onClose: () => void;
  empty: string;
}) {
  return (
    <div className="max-h-40 overflow-y-auto border-b border-border bg-bg-raised">
      {items.length === 0 ? (
        <p className="px-4 py-2 text-xs text-fg-tertiary">{empty}</p>
      ) : (
        items.map((it) => (
          <button
            key={it.key}
            onClick={() => onPick(it.token)}
            className="block w-full truncate px-4 py-1.5 text-left text-xs text-fg-secondary hover:bg-bg-hover hover:text-fg-primary"
          >
            {it.label}
          </button>
        ))
      )}
      <button
        onClick={onClose}
        className="label-mono block w-full px-4 py-1 text-right text-fg-tertiary hover:text-fg-primary"
      >
        关闭
      </button>
    </div>
  );
}
