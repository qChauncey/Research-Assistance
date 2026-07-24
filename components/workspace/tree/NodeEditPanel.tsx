"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { getDomain } from "@/lib/domains";
import { isEmpirical } from "@/lib/methodology";
import { Button, Input, Field } from "@/components/ui/primitives";
import type { ArgNode, Domain, NodeStatus, ProgramRole } from "@/lib/db/schema";
import type { FieldDef } from "@/lib/domains/types";
import EvidenceList from "./EvidenceList";

const STATUSES: NodeStatus[] = ["open", "supported", "challenged", "dead"];
const PROGRAM_ROLES: (ProgramRole | "")[] = [
  "",
  "hard_core",
  "protective_belt",
  "novel_prediction",
];

/** 双击节点滑出的编辑面板（§6.6）。承载全部节点 CRUD + 证据。 */
export default function NodeEditPanel({
  nodeId,
  onClose,
}: {
  nodeId: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const nodes = useAppStore((s) => s.nodes);
  const project = useAppStore((s) => s.project);
  const updateNode = useAppStore((s) => s.updateNode);
  const removeNode = useAppStore((s) => s.removeNode);

  const node = nodes.find((n) => n.id === nodeId);
  const domain = (project?.domain ?? "general") as Domain;
  const schema = getDomain(domain);

  const [claim, setClaim] = useState("");
  const [falsifier, setFalsifier] = useState("");

  useEffect(() => {
    if (node) {
      setClaim(node.claim);
      setFalsifier(node.falsifier ?? "");
    }
  }, [nodeId, node?.claim, node?.falsifier]);

  if (!node) return null;

  const empirical = isEmpirical(node, domain);
  const parentOptions = nodes.filter(
    (n) => n.id !== node.id && !isDescendant(nodes, node.id, n.id),
  );

  function commit(patch: Partial<ArgNode>) {
    updateNode(node!.id, patch);
  }

  function setDomainField(key: string, value: unknown) {
    commit({ domain_fields: { ...node!.domain_fields, [key]: value } });
  }

  return (
    <div className="flex h-full w-[340px] flex-col border-l border-border bg-bg-surface">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="label-mono text-fg-secondary">{t.tree.editNode}</span>
        <button
          onClick={onClose}
          className="label-mono text-fg-tertiary hover:text-fg-primary"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        {/* 命题 */}
        <Field label={t.tree.claim}>
          <textarea
            value={claim}
            onChange={(e) => setClaim(e.target.value)}
            onBlur={(e) => {
              const v = e.target.value;
              if (v !== node.claim) commit({ claim: v });
            }}
            rows={3}
            className="w-full resize-y rounded-sm border border-border bg-bg-void px-3 py-2 font-sans text-sm text-fg-primary outline-none focus:border-border-focus"
            placeholder="命题内容…"
          />
        </Field>

        {/* 类型 —— 从领域配置动态生成 */}
        <Field label={t.tree.nodeType}>
          <select
            value={node.node_type}
            onChange={(e) => commit({ node_type: e.target.value })}
            className="w-full rounded-sm border border-border bg-bg-void px-3 py-2 text-sm text-fg-primary outline-none focus:border-border-focus"
          >
            {schema.nodeTypes.map((nt) => (
              <option key={nt.id} value={nt.id}>
                {nt.label}
                {nt.isAssumption ? " · 假设" : ""}
                {nt.empiricalClaim ? " · 经验" : ""}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-fg-tertiary">
            {schema.nodeTypes.find((x) => x.id === node.node_type)?.description}
          </span>
        </Field>

        {/* 置信度 —— 五点，允许直接编辑（A.1.4） */}
        <Field label={t.tree.confidence}>
          <div className="flex items-center gap-2">
            {[0, 0.25, 0.5, 0.75, 1].map((v, i) => (
              <button
                key={i}
                onClick={() => commit({ confidence: v })}
                title={v.toFixed(2)}
                className={`h-6 flex-1 rounded-sm border text-[10px] ${
                  node.confidence !== null && node.confidence >= v && v > 0
                    ? "border-fg-primary bg-fg-primary/20 text-fg-primary"
                    : node.confidence === 0 && v === 0
                      ? "border-fg-primary bg-fg-primary/20 text-fg-primary"
                      : "border-border text-fg-tertiary hover:bg-bg-hover"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </Field>

        {/* 证伪条件 —— 约束三：只对经验节点强制 */}
        <Field
          label={`${t.tree.falsifier}${empirical ? " *" : ""}`}
          hint={empirical ? t.tree.falsifierHint : t.tree.falsifierNA}
        >
          {empirical ? (
            <textarea
              value={falsifier}
              onChange={(e) => setFalsifier(e.target.value)}
              onBlur={(e) => {
                const v = e.target.value;
                if (v !== (node.falsifier ?? "")) commit({ falsifier: v || null });
              }}
              rows={2}
              className={`w-full resize-y rounded-sm border bg-bg-void px-3 py-2 text-sm text-fg-primary outline-none focus:border-border-focus ${
                falsifier.trim() ? "border-border" : "border-contradict/50"
              }`}
              placeholder="什么观察结果会推翻它？"
            />
          ) : (
            <p className="rounded-sm border border-border bg-bg-void px-3 py-2 text-xs text-fg-tertiary">
              —
            </p>
          )}
        </Field>

        {/* Lakatos 纲领角色 */}
        <Field label={t.tree.programRole}>
          <select
            value={node.program_role ?? ""}
            onChange={(e) =>
              commit({
                program_role: (e.target.value || null) as ProgramRole | null,
              })
            }
            className="w-full rounded-sm border border-border bg-bg-void px-3 py-2 text-sm text-fg-primary outline-none focus:border-border-focus"
          >
            {PROGRAM_ROLES.map((r) => (
              <option key={r || "none"} value={r}>
                {r === "" ? t.programRole.none : t.programRole[r]}
              </option>
            ))}
          </select>
        </Field>

        {/* 领域字段 —— 表单驱动 */}
        {schema.domainFields.length > 0 && (
          <div className="space-y-3 border-t border-border pt-4">
            <span className="label-mono block text-fg-secondary">
              {t.tree.domainFields}
            </span>
            {schema.domainFields.map((f) => (
              <DomainFieldInput
                key={f.key}
                def={f}
                nodeType={node.node_type}
                value={node.domain_fields[f.key]}
                onChange={(v) => setDomainField(f.key, v)}
              />
            ))}
          </div>
        )}

        {/* 父节点 + 状态 */}
        <div className="grid grid-cols-1 gap-3 border-t border-border pt-4">
          <Field label={t.tree.parentNode}>
            <select
              value={node.parent_id ?? ""}
              onChange={(e) =>
                commit({ parent_id: e.target.value || null })
              }
              className="w-full rounded-sm border border-border bg-bg-void px-3 py-2 text-sm text-fg-primary outline-none focus:border-border-focus"
            >
              <option value="">{t.tree.noParent}</option>
              {parentOptions.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.claim.slice(0, 30) || n.id.slice(0, 6)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t.tree.status}>
            <select
              value={node.status === "conflict_copy" ? "open" : node.status}
              onChange={(e) => commit({ status: e.target.value as NodeStatus })}
              className="w-full rounded-sm border border-border bg-bg-void px-3 py-2 text-sm text-fg-primary outline-none focus:border-border-focus"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t.status[s]}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {/* 证据列表 —— 反证据与支持证据对等（约束一） */}
        <div className="border-t border-border pt-4">
          <EvidenceList nodeId={node.id} />
        </div>
      </div>

      <div className="border-t border-border p-4">
        <Button
          variant="danger"
          className="w-full"
          onClick={() => {
            removeNode(node.id);
            onClose();
          }}
        >
          {t.common.delete}
        </Button>
      </div>
    </div>
  );
}

function DomainFieldInput({
  def,
  nodeType,
  value,
  onChange,
}: {
  def: FieldDef;
  nodeType: string;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const required =
    def.required || (def.requiredFor?.includes(nodeType) ?? false);
  const label = `${def.label}${required ? " *" : ""}`;

  if (def.type === "select") {
    return (
      <Field label={label}>
        <select
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value || undefined)}
          className="w-full rounded-sm border border-border bg-bg-void px-3 py-2 text-sm text-fg-primary outline-none focus:border-border-focus"
        >
          <option value="">—</option>
          {def.options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </Field>
    );
  }
  if (def.type === "boolean") {
    return (
      <label className="flex items-center justify-between">
        <span className="label-mono text-fg-secondary">{label}</span>
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 accent-white"
        />
      </label>
    );
  }
  if (def.type === "scale_1_5") {
    return (
      <Field label={label}>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => onChange(n)}
              className={`h-7 flex-1 rounded-sm border text-xs ${
                value === n
                  ? "border-fg-primary bg-fg-primary/20 text-fg-primary"
                  : "border-border text-fg-tertiary hover:bg-bg-hover"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </Field>
    );
  }
  if (def.type === "auto") {
    return (
      <Field label={label} hint="自动计算（Phase 2/3）">
        <p className="rounded-sm border border-border bg-bg-void px-3 py-2 text-xs text-fg-tertiary">
          auto
        </p>
      </Field>
    );
  }
  // text | number | url
  return (
    <Field label={label}>
      <Input
        type={def.type === "number" ? "number" : def.type === "url" ? "url" : "text"}
        value={(value as string) ?? ""}
        onChange={(e) =>
          onChange(
            def.type === "number"
              ? e.target.value === ""
                ? undefined
                : Number(e.target.value)
              : e.target.value || undefined,
          )
        }
      />
    </Field>
  );
}

/** 判断 candidate 是否为 nodeId 的后代（禁止把节点挂到自己子树下）。 */
function isDescendant(
  nodes: ArgNode[],
  nodeId: string,
  candidateId: string,
): boolean {
  let cur: string | null = candidateId;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  while (cur) {
    if (cur === nodeId) return true;
    cur = byId.get(cur)?.parent_id ?? null;
  }
  return false;
}
