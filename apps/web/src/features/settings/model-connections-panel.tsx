"use client";

import { useEffect, useMemo, useState } from "react";

import type { ModelConnection, ModelConnectionPreset } from "@agenthub/contracts";

import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import { apiBaseUrl } from "../../lib/api-base-url";
import { readApiErrorMessage } from "../../lib/api-errors";

type ValidationState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "failed"; message: string }
  | { kind: "passed"; message: string };

const presetOptions: Array<{ label: string; value: ModelConnectionPreset }> = [
  { label: "均衡", value: "balanced" },
  { label: "快速", value: "fast" },
  { label: "高性能", value: "powerful" }
];

export function ModelConnectionsPanel({ workspaceId }: { workspaceId: string }) {
  const [apiKey, setApiKey] = useState("");
  const [connections, setConnections] = useState<ModelConnection[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [label, setLabel] = useState("DeepSeek 工作区连接");
  const [model, setModel] = useState("deepseek-chat");
  const [preset, setPreset] = useState<ModelConnectionPreset>("balanced");
  const [validation, setValidation] = useState<ValidationState>({ kind: "idle" });

  useEffect(() => {
    void loadConnections();
  }, [workspaceId]);

  useEffect(() => {
    setValidation({ kind: "idle" });
  }, [apiKey, label, model, preset, workspaceId]);

  const validateDisabledReason = useMemo(
    () =>
      resolveValidateDisabledReason({
        apiKey,
        isBusy: validation.kind === "checking",
        label,
        model,
        workspaceId
      }),
    [apiKey, label, model, validation.kind, workspaceId]
  );
  const saveDisabledReason = useMemo(
    () =>
      resolveSaveDisabledReason({
        apiKey,
        isBusy: isSaving,
        label,
        model,
        validation,
        workspaceId
      }),
    [apiKey, isSaving, label, model, validation, workspaceId]
  );

  async function loadConnections(): Promise<void> {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch(
        `${apiBaseUrl}/credentials/model-connections?workspaceId=${workspaceId}`,
        { credentials: "include" }
      );
      const payload = await readJson(response);

      if (!response.ok) {
        throw new Error(readErrorMessage(payload, "无法加载模型连接。"));
      }

      setConnections(Array.isArray(payload) ? (payload as ModelConnection[]) : []);
    } catch (error) {
      setConnections([]);
      setErrorMessage(error instanceof Error ? error.message : "无法加载模型连接。");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleValidate(): Promise<void> {
    const reason = resolveValidateDisabledReason({
      apiKey,
      isBusy: validation.kind === "checking",
      label,
      model,
      workspaceId
    });
    if (reason) {
      setValidation({ kind: "failed", message: reason });
      return;
    }

    setErrorMessage(null);
    setValidation({ kind: "checking" });

    try {
      const response = await fetch(`${apiBaseUrl}/credentials/model-connections/validate`, {
        body: JSON.stringify(buildPayload({ apiKey, label, model, preset, workspaceId })),
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const payload = await readJson(response);
      const message = readErrorMessage(payload, "连接验证失败。");

      if (!response.ok || !isValidationPayloadValid(payload)) {
        setValidation({ kind: "failed", message });
        return;
      }

      setValidation({ kind: "passed", message: message || "连接验证通过。" });
    } catch {
      setValidation({ kind: "failed", message: "连接验证失败，请稍后重试。" });
    }
  }

  async function handleSave(): Promise<void> {
    const reason = resolveSaveDisabledReason({
      apiKey,
      isBusy: isSaving,
      label,
      model,
      validation,
      workspaceId
    });
    if (reason) {
      setValidation({ kind: "failed", message: reason });
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`${apiBaseUrl}/credentials/model-connections`, {
        body: JSON.stringify(buildPayload({ apiKey, label, model, preset, workspaceId })),
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const payload = await readJson(response);

      if (!response.ok) {
        throw new Error(readErrorMessage(payload, "保存模型连接失败。"));
      }

      setApiKey("");
      setValidation({ kind: "idle" });
      await loadConnections();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "保存模型连接失败。");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="grid gap-5">
      <section className="grid gap-4 rounded-[28px] border border-slate-200 bg-white/85 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Badge tone="primary">DeepSeek</Badge>
            <h3 className="m-0 mt-3 text-xl font-semibold text-slate-950">添加模型连接</h3>
            <p className="mb-0 mt-2 text-sm leading-7 text-slate-600">
              连接后，编码协作会自动使用当前工作区的可用连接。API Key 只用于服务端执行，不会在页面中明文展示。
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            当前工作区
          </span>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <label className={fieldLabelClassName}>
            连接名称
            <Input value={label} onChange={(event) => setLabel(event.target.value)} />
          </label>
          <label className={fieldLabelClassName}>
            模型
            <Input value={model} onChange={(event) => setModel(event.target.value)} />
          </label>
          <label className={fieldLabelClassName}>
            API Key
            <Input
              autoComplete="off"
              placeholder="sk-..."
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
            />
          </label>
          <label className={fieldLabelClassName}>
            默认偏好
            <Select
              value={preset}
              onChange={(event) => setPreset(event.target.value as ModelConnectionPreset)}
            >
              {presetOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <ConnectionState validation={validation} />
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={Boolean(validateDisabledReason)}
              onClick={() => void handleValidate()}
              title={validateDisabledReason ?? undefined}
              type="button"
              variant="outline"
            >
              {validation.kind === "checking" ? "验证中..." : "验证连接"}
            </Button>
            <Button
              disabled={Boolean(saveDisabledReason)}
              onClick={() => void handleSave()}
              title={saveDisabledReason ?? undefined}
              type="button"
            >
              {isSaving ? "保存中..." : "保存并启用"}
            </Button>
          </div>
        </div>
        {validateDisabledReason || saveDisabledReason ? (
          <p className="m-0 text-sm leading-6 text-slate-500">
            {saveDisabledReason ?? validateDisabledReason}
          </p>
        ) : null}
        {errorMessage ? <p className="m-0 text-sm font-medium text-red-700">{errorMessage}</p> : null}
      </section>

      <section className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="m-0 text-lg font-semibold text-slate-950">已保存连接</h3>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            {connections.length} 个
          </span>
        </div>
        {isLoading ? (
          <ConnectionEmpty title="正在加载连接..." />
        ) : connections.length === 0 ? (
          <ConnectionEmpty title="当前工作区还没有模型连接。" />
        ) : (
          connections.map((connection) => (
            <article
              key={connection.id}
              className="grid gap-3 rounded-[24px] border border-slate-200 bg-white/85 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <strong className="text-slate-950">{connection.label}</strong>
                <Badge tone={connection.status === "valid" ? "primary" : "muted"}>
                  {renderConnectionStatus(connection.status)}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-500">
                <span className="rounded-full bg-slate-100 px-3 py-1">{connection.model}</span>
                <span className="rounded-full bg-slate-100 px-3 py-1">
                  {renderPreset(connection.preset)}
                </span>
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}

function ConnectionState({ validation }: { validation: ValidationState }) {
  switch (validation.kind) {
    case "checking":
      return <p className="m-0 text-sm font-medium text-slate-600">正在验证连接...</p>;
    case "failed":
      return <p className="m-0 text-sm font-medium text-red-700">{validation.message}</p>;
    case "passed":
      return <p className="m-0 text-sm font-medium text-emerald-700">{validation.message}</p>;
    case "idle":
      return <p className="m-0 text-sm text-slate-500">保存前请先验证连接。</p>;
  }
}

function ConnectionEmpty({ title }: { title: string }) {
  return (
    <article className="rounded-[24px] border border-dashed border-slate-200 bg-white/70 p-4 text-sm leading-7 text-slate-600">
      {title}
    </article>
  );
}

function buildPayload(input: {
  apiKey: string;
  label: string;
  model: string;
  preset: ModelConnectionPreset;
  workspaceId: string;
}) {
  return {
    apiKey: input.apiKey.trim(),
    label: input.label.trim(),
    model: input.model.trim(),
    preset: input.preset,
    workspaceId: input.workspaceId
  };
}

function isValidationPayloadValid(payload: unknown): boolean {
  return (
    payload !== null &&
    typeof payload === "object" &&
    "valid" in payload &&
    (payload as { valid?: unknown }).valid === true
  );
}

function readErrorMessage(payload: unknown, fallback: string): string {
  return readApiErrorMessage(payload, fallback);
}

async function readJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return null;
  }

  return response.json().catch(() => null);
}

function renderConnectionStatus(status: ModelConnection["status"]): string {
  switch (status) {
    case "valid":
      return "可用";
    case "invalid":
      return "不可用";
    case "pending":
      return "待验证";
  }
}

function renderPreset(preset: ModelConnectionPreset): string {
  switch (preset) {
    case "balanced":
      return "均衡";
    case "fast":
      return "快速";
    case "powerful":
      return "高性能";
  }
}

function resolveValidateDisabledReason(input: {
  apiKey: string;
  isBusy: boolean;
  label: string;
  model: string;
  workspaceId: string;
}): string | null {
  if (!input.workspaceId) {
    return "正在同步当前工作区。";
  }
  if (input.isBusy) {
    return "连接正在验证中。";
  }
  if (!input.label.trim()) {
    return "请填写连接名称。";
  }
  if (!input.model.trim()) {
    return "请填写模型名称。";
  }
  if (!input.apiKey.trim()) {
    return "请填写 API Key。";
  }
  return null;
}

function resolveSaveDisabledReason(input: {
  apiKey: string;
  isBusy: boolean;
  label: string;
  model: string;
  validation: ValidationState;
  workspaceId: string;
}): string | null {
  const baseReason = resolveValidateDisabledReason({
    ...input,
    isBusy: false
  });
  if (baseReason) {
    return baseReason;
  }
  if (input.isBusy) {
    return "连接正在保存中。";
  }
  if (input.validation.kind !== "passed") {
    return "请先验证连接，再保存启用。";
  }
  return null;
}

const fieldLabelClassName = "grid gap-2 text-sm font-semibold text-slate-700";
