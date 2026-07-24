"use client";

import { useEffect, useRef, useState } from "react";
import { useAppStore } from "@/lib/store";
import { getDomain } from "@/lib/domains";
import { structureCheck } from "@/lib/redteam";
import { chat, extractJSON, NotConfiguredError } from "@/lib/llm/client";
import {
  composeSystem,
  renderNodeContext,
  redTeamPrompt,
  divergePrompt,
  comparePrompt,
  makeNodePrompt,
} from "@/lib/prompts";
import type { Domain } from "@/lib/db/schema";

/**
 * 中栏底部对话框（§6.5）——唯一 AI 入口。Phase 3 主体。
 * 五种调用类型各有固定 prompt 与输出去向；所有产出进候选区（约束四），不直接改树。
 * 每条产出附「我为什么可能是错的」。
 */
type Turn = { role: "user" | "ai" | "system"; text: string };

export default function DialogBox() {
  const apiConfig = useAppStore((s) => s.apiConfig);
  const language = useAppStore((s) => s.language);
  const project = useAppStore((s) => s.project);
  const nodes = useAppStore((s) => s.nodes);
  const evidence = useAppStore((s) => s.evidence);
  const selectedNodeId = useAppStore((s) => s.selectedNodeId);
  const requestSearch = useAppStore((s) => s.requestSearch);
  const addCandidate = useAppStore((s) => s.addCandidate);
  const pendingRedTeam = useAppStore((s) => s.pendingRedTeam);
  const clearPendingRedTeam = useAppStore((s) => s.clearPendingRedTeam);

  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const redTeamRef = useRef<() => void>(() => {});

  const domain = (project?.domain ?? "general") as Domain;
  const outputLang = language?.ui ?? "zh-CN";
  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;
  const system = composeSystem(domain, outputLang);

  function push(t: Turn) {
    setTurns((prev) => [...prev, t]);
  }

  function nodeCtxText(): string {
    if (!selectedNode) return "（未选中节点，针对整棵树/一般性问题）";
    return renderNodeContext({
      claim: selectedNode.claim,
      node_type: selectedNode.node_type,
      falsifier: selectedNode.falsifier,
      confidence: selectedNode.confidence,
    });
  }

  function handleErr(e: unknown) {
    const msg =
      e instanceof NotConfiguredError
        ? e.message
        : e instanceof Error
          ? e.message
          : String(e);
    push({ role: "system", text: `⚠ ${msg}` });
  }

  // —— 自由对话 ——
  async function sendFree() {
    const q = input.trim();
    if (!q || busy) return;
    setInput("");
    push({ role: "user", text: q });
    setBusy(true);
    try {
      const ctx = selectedNode ? `${nodeCtxText()}\n\n问题：${q}` : q;
      const reply = await chat(apiConfig, {
        system,
        messages: [{ role: "user", content: ctx }],
      });
      push({ role: "ai", text: reply });
    } catch (e) {
      handleErr(e);
    } finally {
      setBusy(false);
    }
  }

  // —— ⌕ 检索（Phase 2 已实现，触发左栏） ——
  function doSearch() {
    const q = selectedNode?.claim?.trim() || input.trim();
    if (!q) {
      push({ role: "system", text: "先选中一个有命题的节点，或在输入框写检索词。" });
      return;
    }
    requestSearch(q);
    push({ role: "system", text: `⌕ 已在左栏检索：「${q.slice(0, 40)}」` });
  }

  // —— ⚔ 红队：第1步确定性结构检查（无 LLM）+ 第2步领域序列（LLM）→ 候选区 ——
  async function doRedTeam() {
    if (!selectedNode) {
      push({ role: "system", text: "红队需要先选中一个节点。" });
      return;
    }
    // 第 1 步：结构检查（纯代码）
    const issues = structureCheck(selectedNode, domain, nodes, evidence);
    const issueText =
      issues.length === 0
        ? "结构检查：未发现确定性结构问题。"
        : "结构检查（确定性，无 LLM）：\n" +
          issues.map((i) => `· [${i.basis}] ${i.message}`).join("\n");
    push({ role: "system", text: `⚔ ${issueText}` });

    // 第 2 步：领域红队序列（LLM）
    setBusy(true);
    try {
      const reply = await chat(apiConfig, {
        system,
        messages: [
          {
            role: "user",
            content: redTeamPrompt(
              nodeCtxText(),
              issues.map((i) => `- ${i.message}`).join("\n"),
            ),
          },
        ],
      });
      const parsed = extractJSON<{
        findings?: { dimension?: string; issue?: string; self_critique?: string }[];
      }>(reply);
      const findings = parsed?.findings ?? [];
      if (findings.length === 0) {
        push({ role: "ai", text: reply });
      } else {
        for (const f of findings) {
          await addCandidate({
            kind: "counter_evidence",
            target_node_id: selectedNode.id,
            content: { issue: f.issue ?? "", dimension: f.dimension ?? "" },
            self_critique: f.self_critique ?? "",
          });
        }
        push({
          role: "system",
          text: `⚔ 红队生成 ${findings.length} 条挑战 → 右栏候选区待判死/采纳（采纳即挂为反证据）。`,
        });
      }
    } catch (e) {
      handleErr(e);
    } finally {
      setBusy(false);
    }
  }

  // —— ✦ 发散 → 候选区（direction） ——
  async function doDiverge() {
    if (!selectedNode) {
      push({ role: "system", text: "发散需要先选中一个节点作为出发点。" });
      return;
    }
    setBusy(true);
    try {
      const reply = await chat(apiConfig, {
        system,
        messages: [{ role: "user", content: divergePrompt(nodeCtxText()) }],
      });
      const parsed = extractJSON<{
        directions?: { content?: string; self_critique?: string }[];
      }>(reply);
      const dirs = parsed?.directions ?? [];
      if (dirs.length === 0) {
        push({ role: "ai", text: reply });
      } else {
        for (const d of dirs) {
          await addCandidate({
            kind: "direction",
            target_node_id: selectedNode.id,
            content: { content: d.content ?? "" },
            self_critique: d.self_critique ?? "",
          });
        }
        push({
          role: "system",
          text: `✦ 发散生成 ${dirs.length} 个方向 → 候选区（每条附自我攻击；采纳即入树）。`,
        });
      }
    } catch (e) {
      handleErr(e);
    } finally {
      setBusy(false);
    }
  }

  // —— ⇄ 对比（用输入框内容作对方材料） → 候选区（route_diff） ——
  async function doCompare() {
    if (!selectedNode) {
      push({ role: "system", text: "对比需要先选中一个节点。" });
      return;
    }
    const others = input.trim();
    if (!others) {
      push({ role: "system", text: "把对方论文的假设/方法/结论粘到输入框，再点对比。" });
      return;
    }
    setInput("");
    setBusy(true);
    try {
      const reply = await chat(apiConfig, {
        system,
        messages: [{ role: "user", content: comparePrompt(nodeCtxText(), others) }],
      });
      const parsed = extractJSON<{ self_critique?: string }>(reply);
      await addCandidate({
        kind: "route_diff",
        target_node_id: selectedNode.id,
        content: (parsed ?? { raw: reply }) as Record<string, unknown>,
        self_critique: parsed?.self_critique ?? "",
      });
      push({ role: "system", text: "⇄ 路线对比 → 候选区（分歧点最有价值）。" });
    } catch (e) {
      handleErr(e);
    } finally {
      setBusy(false);
    }
  }

  // —— ⊕ 建节点：把最近对话结论转成节点草案 → 候选区 ——
  async function doMakeNode() {
    const convo = turns
      .filter((t) => t.role !== "system")
      .slice(-6)
      .map((t) => `${t.role === "user" ? "用户" : "AI"}：${t.text}`)
      .join("\n");
    if (!convo && !input.trim()) {
      push({ role: "system", text: "先对话或在输入框写下要建节点的结论。" });
      return;
    }
    setBusy(true);
    try {
      const reply = await chat(apiConfig, {
        system,
        messages: [
          { role: "user", content: makeNodePrompt(convo || input.trim(), domain) },
        ],
      });
      const parsed = extractJSON<{
        claim?: string;
        node_type?: string;
        falsifier?: string;
        self_critique?: string;
      }>(reply);
      if (!parsed?.claim) {
        push({ role: "ai", text: reply });
      } else {
        await addCandidate({
          kind: "direction",
          target_node_id: selectedNode?.id ?? null,
          content: {
            claim: parsed.claim,
            node_type: parsed.node_type ?? "",
            falsifier: parsed.falsifier ?? "",
          },
          self_critique: parsed.self_critique ?? "",
        });
        push({
          role: "system",
          text: `⊕ 节点草案 → 候选区（采纳后进树，你可再编辑）。`,
        });
      }
    } catch (e) {
      handleErr(e);
    } finally {
      setBusy(false);
    }
  }

  // 树工具栏「⚔ 红队」→ 这里接住执行（selectedNode 已被 store 设为该节点）
  redTeamRef.current = doRedTeam;
  useEffect(() => {
    if (pendingRedTeam) {
      clearPendingRedTeam();
      // 等一拍让 selectedNode 落定再跑
      setTimeout(() => redTeamRef.current(), 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRedTeam]);

  const schema = getDomain(domain);

  return (
    <div className="border-t border-border bg-bg-surface">
      <div className="px-3 pt-2">
        <span className="label-mono text-fg-secondary">▸ 对话</span>
        <span className="label-mono ml-2 text-fg-tertiary">
          {schema.label} · 唯一 AI 入口
        </span>
      </div>

      {/* 对话记录 */}
      {turns.length > 0 && (
        <div className="max-h-40 space-y-2 overflow-y-auto px-3 py-2">
          {turns.map((t, i) => (
            <div key={i} className="text-xs leading-relaxed">
              {t.role === "user" && <span className="text-fg-secondary">你 · </span>}
              {t.role === "system" ? (
                <span className="whitespace-pre-wrap text-fg-tertiary">{t.text}</span>
              ) : (
                <span
                  className={`whitespace-pre-wrap ${
                    t.role === "user" ? "text-fg-primary" : "text-fg-secondary"
                  }`}
                >
                  {t.text}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="p-3">
        <div className="flex items-center gap-2 rounded-sm border border-border bg-bg-void px-3 py-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendFree();
            }}
            disabled={busy}
            placeholder={busy ? "思考中…" : "问点什么…（⌘↵ 发送）"}
            className="flex-1 bg-transparent text-sm text-fg-primary outline-none placeholder:text-fg-tertiary"
          />
          <button
            onClick={sendFree}
            disabled={busy || !input.trim()}
            className="label-mono text-fg-tertiary hover:text-fg-primary disabled:opacity-40"
          >
            ⌘↵
          </button>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1">
          <ActBtn onClick={doRedTeam} disabled={busy} label="⚔ 红队" />
          <ActBtn onClick={doSearch} disabled={busy} label="⌕ 检索" />
          <ActBtn onClick={doDiverge} disabled={busy} label="✦ 发散" />
          <ActBtn onClick={doCompare} disabled={busy} label="⇄ 对比" />
          <ActBtn onClick={doMakeNode} disabled={busy} label="⊕ 建节点" />
        </div>

        <div className="mt-2 flex items-center justify-between">
          <span className="label-mono text-fg-tertiary">
            上下文：
            {selectedNode
              ? selectedNode.claim.slice(0, 20) || "选中节点"
              : "整棵树"}
          </span>
          {!apiConfig?.model && (
            <span className="label-mono text-fg-tertiary">
              未配置模型 · 设置里选服务商
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function ActBtn({
  onClick,
  disabled,
  label,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="label-mono rounded-sm border border-border px-2 py-1 text-fg-tertiary hover:bg-bg-hover hover:text-fg-secondary disabled:opacity-40"
    >
      {label}
    </button>
  );
}
