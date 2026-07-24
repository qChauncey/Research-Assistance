"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Button, Input, Field, RadioGroup } from "@/components/ui/primitives";
import type { ApiConfig } from "@/lib/db/schema";
import { PROVIDERS, getProvider, defaultModel } from "@/lib/providers";
import type { OnboardingDraft } from "./OnboardingFlow";

/**
 * 步骤 2 配置 API (§6.1)。BYOK，多服务商兼容（lib/providers.ts）。
 * 选服务商 → 自动带出 Base URL 与模型下拉；兼容端点/Ollama 可编辑 Base URL；
 * 任何服务商都可手填模型 ID。「测试连接」真实发一次最小请求（经服务端转发避 CORS）。
 * key 默认只存本设备浏览器。LLM 调用本身在 Phase 3。
 */
export default function StepApiConfig({
  draft,
  patch,
  onBack,
  onNext,
}: {
  draft: OnboardingDraft;
  patch: (p: Partial<OnboardingDraft>) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const { t } = useI18n();
  const [local, setLocal] = useState<ApiConfig>(draft.apiConfig);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<
    { ok: boolean; msg: string } | null
  >(null);
  const [customModel, setCustomModel] = useState(false);

  const provider = local.provider ? getProvider(local.provider) : undefined;

  function update(p: Partial<ApiConfig>) {
    const next = { ...local, ...p, tested: false };
    setLocal(next);
    patch({ apiConfig: next });
    setTestResult(null);
  }

  function selectProvider(id: string) {
    const p = getProvider(id);
    setCustomModel(false);
    update({
      provider: id,
      baseUrl: p?.editableBaseUrl ? (local.baseUrl ?? p?.baseUrl ?? "") : undefined,
      model: defaultModel(id),
    });
  }

  const modelOptions = useMemo(() => provider?.models ?? [], [provider]);

  async function testConnection() {
    if (!local.provider || !local.model) {
      setTestResult({ ok: false, msg: "先选择服务商和模型" });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/llm/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: local.provider,
          apiKey: local.apiKey,
          baseUrl: local.baseUrl,
          model: local.model,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setTestResult({ ok: true, msg: `✓ 已连接 · ${data.latencyMs}ms · ${data.model}` });
        const next = { ...local, tested: true };
        setLocal(next);
        patch({ apiConfig: next });
      } else {
        setTestResult({ ok: false, msg: data.error ?? "连接失败" });
      }
    } catch (e) {
      setTestResult({ ok: false, msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-6 rounded-sm border border-border bg-bg-surface p-8">
      <h2 className="label-mono text-fg-primary">{t.onboarding.apiTitle}</h2>

      {/* 服务商 */}
      <Field label={t.onboarding.apiProvider}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => selectProvider(p.id)}
              className={`rounded-sm border px-2 py-2 text-left text-xs transition-colors ${
                local.provider === p.id
                  ? "border-border-focus bg-bg-raised text-fg-primary"
                  : "border-border text-fg-secondary hover:bg-bg-hover"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {provider?.note && (
          <span className="mt-1 block text-xs text-fg-tertiary">{provider.note}</span>
        )}
      </Field>

      {provider && (
        <>
          {/* Base URL（仅可编辑服务商显示） */}
          {provider.editableBaseUrl && (
            <Field label="Base URL">
              <Input
                value={local.baseUrl ?? ""}
                onChange={(e) => update({ baseUrl: e.target.value })}
                placeholder={provider.baseUrl || "https://your-endpoint/v1"}
              />
            </Field>
          )}

          {/* 模型 */}
          <Field
            label="模型"
            hint={
              provider.docsUrl
                ? `模型列表可能随官方更新，核对：${provider.docsUrl}`
                : undefined
            }
          >
            {modelOptions.length > 0 && !customModel ? (
              <div className="space-y-2">
                <select
                  value={local.model ?? ""}
                  onChange={(e) => update({ model: e.target.value })}
                  className="w-full rounded-sm border border-border bg-bg-void px-3 py-2 text-sm text-fg-primary outline-none focus:border-border-focus"
                >
                  {modelOptions.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                      {m.note ? ` · ${m.note}` : ""}
                    </option>
                  ))}
                </select>
                {provider.allowCustomModel && (
                  <button
                    type="button"
                    onClick={() => setCustomModel(true)}
                    className="label-mono text-fg-tertiary hover:text-fg-primary"
                  >
                    + 手填模型 ID
                  </button>
                )}
              </div>
            ) : (
              <Input
                value={local.model ?? ""}
                onChange={(e) => update({ model: e.target.value })}
                placeholder="模型 ID，如 deepseek-chat / gpt-5 / claude-opus-5"
              />
            )}
          </Field>

          {/* API Key */}
          <Field label={t.onboarding.apiKey}>
            <Input
              type="password"
              value={local.apiKey}
              onChange={(e) => update({ apiKey: e.target.value })}
              placeholder={provider.keyPlaceholder}
            />
          </Field>

          {/* 存储位置 */}
          <Field label={t.onboarding.apiStorage}>
            <RadioGroup
              value={local.storage}
              onChange={(v) => update({ storage: v })}
              options={[
                { value: "local", label: t.onboarding.storageLocal },
                { value: "encrypted_sync", label: t.onboarding.storageSync },
              ]}
            />
          </Field>

          {/* 测试连接 */}
          <div className="flex items-center gap-3">
            <Button onClick={testConnection} disabled={testing || !local.model}>
              {testing ? "测试中…" : t.onboarding.testConnection}
            </Button>
            {testResult && (
              <span
                className={`text-xs ${testResult.ok ? "text-fg-secondary" : "text-contradict"}`}
              >
                {testResult.msg}
              </span>
            )}
          </div>
          <p className="text-xs text-fg-tertiary">
            LLM 调用（对话/红队/发散）在 Phase 3 接入；此处仅保存配置并可测试连通性。
          </p>
        </>
      )}

      <div className="space-y-1 border-t border-border pt-4">
        <span className="label-mono block text-fg-secondary">
          {t.onboarding.litSearch}
        </span>
        <p className="text-xs text-fg-tertiary">✓ OpenAlex · ✓ arXiv</p>
      </div>

      <div className="flex justify-between">
        <Button onClick={onBack}>{t.common.back}</Button>
        <Button variant="primary" onClick={onNext}>
          {t.common.next}
        </Button>
      </div>
    </div>
  );
}
