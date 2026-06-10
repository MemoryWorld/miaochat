"use client";

import { useEffect, useMemo, useState } from "react";

import type { ProviderCredential } from "@agenthub/contracts";

import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import { apiBaseUrl } from "../../lib/api-base-url";
import { readApiErrorMessage } from "../../lib/api-errors";

type CredentialMetadata = Omit<ProviderCredential, "encryptedSecret">;
type RuntimeProvider = Extract<
  ProviderCredential["provider"],
  "claude-code" | "codex" | "deepseek" | "opencode"
>;
type ValidationState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "failed"; message: string }
  | { kind: "passed"; message: string };

type ConnectionOption = {
  accountHelp: string;
  accountLabel: string;
  defaultAccountId: string;
  defaultLabel: string;
  id: string;
  keyPlaceholder: string;
  label: string;
  provider: RuntimeProvider;
  summary: string;
};

const connectionOptions: ConnectionOption[] = [
  {
    accountHelp: "",
    accountLabel: "OpenCode 模型标识",
    defaultAccountId: "deepseek/deepseek-chat",
    defaultLabel: "DeepSeek 连接",
    id: "deepseek-opencode",
    keyPlaceholder: "sk-...",
    label: "DeepSeek",
    provider: "opencode",
    summary: "DeepSeek 模型连接。"
  },
  {
    accountHelp: "",
    accountLabel: "OpenCode 模型标识",
    defaultAccountId: "qwen/qwen3-coder-plus",
    defaultLabel: "通义千问连接",
    id: "qwen-opencode",
    keyPlaceholder: "DashScope API Key",
    label: "通义千问 / Qwen",
    provider: "opencode",
    summary: "Qwen 模型连接。"
  },
  {
    accountHelp: "",
    accountLabel: "OpenCode 模型标识",
    defaultAccountId: "moonshot/kimi-k2",
    defaultLabel: "Kimi 连接",
    id: "moonshot-opencode",
    keyPlaceholder: "Moonshot API Key",
    label: "Kimi / Moonshot",
    provider: "opencode",
    summary: "Kimi 模型连接。"
  },
  {
    accountHelp: "",
    accountLabel: "OpenCode 模型标识",
    defaultAccountId: "zhipu/glm-4.5",
    defaultLabel: "智谱 GLM 连接",
    id: "zhipu-opencode",
    keyPlaceholder: "智谱 API Key",
    label: "智谱 GLM",
    provider: "opencode",
    summary: "GLM 模型连接。"
  },
  {
    accountHelp: "",
    accountLabel: "OpenCode 模型标识",
    defaultAccountId: "minimax/minimax-m1",
    defaultLabel: "MiniMax 连接",
    id: "minimax-opencode",
    keyPlaceholder: "MiniMax API Key",
    label: "MiniMax",
    provider: "opencode",
    summary: "MiniMax 模型连接。"
  },
  {
    accountHelp: "填 OpenCode 支持的 provider/model，例如 deepseek/deepseek-chat 或你的自定义 provider。",
    accountLabel: "OpenCode 模型标识",
    defaultAccountId: "opencode",
    defaultLabel: "OpenCode 自定义连接",
    id: "opencode-custom",
    keyPlaceholder: "API Key",
    label: "OpenCode 自定义",
    provider: "opencode",
    summary: "用于接入其他 OpenCode / OpenAI-compatible 模型。"
  },
  {
    accountHelp: "Codex 账号标识；具体模型可由 CODEX_MODEL 环境变量控制。",
    accountLabel: "账号标识",
    defaultAccountId: "codex",
    defaultLabel: "Codex 工作区连接",
    id: "codex",
    keyPlaceholder: "sk-...",
    label: "Codex",
    provider: "codex",
    summary: "接入 OpenAI Codex SDK。"
  },
  {
    accountHelp: "Claude Code 账号标识；具体模型可由 CLAUDE_CODE_MODEL 环境变量控制。",
    accountLabel: "账号标识",
    defaultAccountId: "anthropic",
    defaultLabel: "Claude Code 工作区连接",
    id: "claude-code",
    keyPlaceholder: "sk-ant-...",
    label: "Claude Code",
    provider: "claude-code",
    summary: "接入 Anthropic Claude Agent SDK。"
  }
];
const defaultConnectionOption = connectionOptions[0]!;

export function ModelConnectionsPanel({ workspaceId }: { workspaceId: string }) {
  const [apiKey, setApiKey] = useState("");
  const [connections, setConnections] = useState<CredentialMetadata[]>([]);
  const [deletingConnectionId, setDeletingConnectionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [connectionOptionId, setConnectionOptionId] = useState(defaultConnectionOption.id);
  const selectedConnectionOption = resolveConnectionOption(connectionOptionId);
  const [label, setLabel] = useState(selectedConnectionOption.defaultLabel);
  const [providerAccountId, setProviderAccountId] = useState(
    selectedConnectionOption.defaultAccountId
  );
  const [validation, setValidation] = useState<ValidationState>({ kind: "idle" });

  useEffect(() => {
    void loadConnections();
  }, [workspaceId]);

  useEffect(() => {
    setValidation({ kind: "idle" });
  }, [apiKey, connectionOptionId, label, providerAccountId, workspaceId]);

  const validateDisabledReason = useMemo(
    () =>
      resolveValidateDisabledReason({
        apiKey,
        isBusy: validation.kind === "checking",
        label,
        providerAccountId,
        workspaceId
      }),
    [apiKey, label, providerAccountId, validation.kind, workspaceId]
  );
  const saveDisabledReason = useMemo(
    () =>
      resolveSaveDisabledReason({
        apiKey,
        isBusy: isSaving,
        label,
        providerAccountId,
        validation,
        workspaceId
      }),
    [apiKey, isSaving, label, providerAccountId, validation, workspaceId]
  );

  async function loadConnections(): Promise<void> {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`${apiBaseUrl}/credentials?workspaceId=${workspaceId}`, {
        credentials: "include"
      });
      const payload = await readJson(response);

      if (!response.ok) {
        throw new Error(readErrorMessage(payload, "无法加载模型连接。"));
      }

      setConnections(
        Array.isArray(payload)
          ? (payload as CredentialMetadata[]).filter((credential) =>
              isVisibleModelCredential(credential)
            )
          : []
      );
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
      providerAccountId,
      workspaceId
    });
    if (reason) {
      setValidation({ kind: "failed", message: reason });
      return;
    }

    setErrorMessage(null);
    setValidation({ kind: "checking" });

    try {
      const response = await fetch(`${apiBaseUrl}/credentials/validate`, {
        body: JSON.stringify(buildPayload({
          apiKey,
          label,
          provider: selectedConnectionOption.provider,
          providerAccountId,
          workspaceId
        })),
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
      providerAccountId,
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
      const response = await fetch(`${apiBaseUrl}/credentials`, {
        body: JSON.stringify(buildPayload({
          apiKey,
          label,
          provider: selectedConnectionOption.provider,
          providerAccountId,
          workspaceId
        })),
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

  async function handleDeleteConnection(connection: CredentialMetadata): Promise<void> {
    const confirmed = window.confirm(
      "确定删除这个模型连接吗？删除后，使用该连接的 AI 同事需要重新选择可用连接。"
    );
    if (!confirmed) {
      return;
    }

    setDeletingConnectionId(connection.id);
    setErrorMessage(null);

    try {
      const response = await fetch(
        `${apiBaseUrl}/credentials/${encodeURIComponent(connection.id)}?workspaceId=${encodeURIComponent(workspaceId)}`,
        {
          credentials: "include",
          method: "DELETE"
        }
      );
      const payload = await readJson(response);

      if (!response.ok) {
        throw new Error(readErrorMessage(payload, "删除模型连接失败。"));
      }

      await loadConnections();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "删除模型连接失败。");
    } finally {
      setDeletingConnectionId(null);
    }
  }

  function handleConnectionOptionChange(nextOptionId: string): void {
    const nextOption = resolveConnectionOption(nextOptionId);
    setConnectionOptionId(nextOption.id);
    setLabel(nextOption.defaultLabel);
    setProviderAccountId(nextOption.defaultAccountId);
  }

  return (
    <div className="grid gap-5">
      <section className="grid gap-4 rounded-[28px] border border-slate-200 bg-white/85 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="m-0 text-xl font-semibold text-slate-950">添加模型连接</h3>
            <p className="mb-0 mt-2 text-sm leading-7 text-slate-600">
              选择来源，填写模型标识和 API Key，验证后保存。
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            当前工作区
          </span>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <label className={fieldLabelClassName}>
            模型来源
            <Select
              aria-label="模型来源"
              value={connectionOptionId}
              onChange={(event) => handleConnectionOptionChange(event.target.value)}
            >
              {connectionOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>
          <label className={fieldLabelClassName}>
            连接名称
            <Input value={label} onChange={(event) => setLabel(event.target.value)} />
          </label>
          <label className={fieldLabelClassName}>
            {selectedConnectionOption.accountLabel}
            <Input
              value={providerAccountId}
              onChange={(event) => setProviderAccountId(event.target.value)}
            />
            {selectedConnectionOption.accountHelp ? (
              <span className="text-xs font-normal leading-5 text-slate-500">
                {selectedConnectionOption.accountHelp}
              </span>
            ) : null}
          </label>
          <label className={fieldLabelClassName}>
            API Key
            <Input
              autoComplete="off"
              placeholder={selectedConnectionOption.keyPlaceholder}
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
            />
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
        {isLoading ? (
          <ConnectionEmpty title="正在加载连接..." />
        ) : connections.length === 0 ? (
          <ConnectionEmpty title="当前工作区还没有模型连接。" />
        ) : (
          connections.map((connection) => {
            const displayLabel = renderConnectionLabel(connection);

            return (
              <article
                key={connection.id}
                className="grid gap-3 rounded-[24px] border border-slate-200 bg-white/85 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <strong className="min-w-0 break-words text-slate-950">
                    {displayLabel}
                  </strong>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={connection.validationState === "valid" ? "primary" : "muted"}>
                      {renderConnectionStatus(connection.validationState)}
                    </Badge>
                    <Button
                      aria-label={`删除 ${displayLabel}`}
                      className="border-red-200 bg-red-50 px-3 text-xs text-red-700 hover:bg-red-100 disabled:text-red-300"
                      disabled={deletingConnectionId === connection.id}
                      onClick={() => void handleDeleteConnection(connection)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {deletingConnectionId === connection.id ? "删除中..." : "删除"}
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-500">
                  <span className="rounded-full bg-slate-100 px-3 py-1">
                    模型：{connection.providerAccountId}
                  </span>
                </div>
              </article>
            );
          })
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
  provider: RuntimeProvider;
  providerAccountId: string;
  workspaceId: string;
}) {
  return {
    label: input.label.trim(),
    provider: input.provider,
    providerAccountId: input.providerAccountId.trim(),
    rawSecret: input.apiKey.trim(),
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

function renderConnectionStatus(status: ProviderCredential["validationState"]): string {
  switch (status) {
    case "valid":
      return "可用";
    case "invalid":
      return "不可用";
    case "pending":
      return "待验证";
  }
}

function renderConnectionLabel(connection: CredentialMetadata): string {
  return connection.label
    .replace(/（OpenCode）/g, " ")
    .replace(/([\u4e00-\u9fff])\s+连接/g, "$1连接")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function isVisibleModelCredential(credential: CredentialMetadata): boolean {
  return (
    credential.provider === "opencode" ||
    credential.provider === "codex" ||
    credential.provider === "claude-code" ||
    credential.provider === "deepseek"
  );
}

function resolveConnectionOption(optionId: string): ConnectionOption {
  return connectionOptions.find((option) => option.id === optionId) ?? defaultConnectionOption;
}

function resolveSavedCredentialOption(credential: CredentialMetadata): ConnectionOption {
  if (credential.provider === "deepseek") {
    return {
      accountHelp: "旧 DeepSeek 直连凭证，仅用于兼容历史数据；新建连接会通过 OpenCode 保存。",
      accountLabel: "模型",
      defaultAccountId: credential.providerAccountId,
      defaultLabel: credential.label,
      id: "legacy-deepseek",
      keyPlaceholder: "sk-...",
      label: "旧 DeepSeek 直连",
      provider: "opencode",
      summary: "历史连接，可删除或新建 OpenCode-backed 连接替换。"
    };
  }

  const matchedPreset = connectionOptions.find(
    (option) =>
      option.provider === credential.provider &&
      option.defaultAccountId === credential.providerAccountId
  );

  if (matchedPreset) {
    return matchedPreset;
  }

  if (credential.provider === "opencode") {
    return resolveConnectionOption("opencode-custom");
  }

  return (
    connectionOptions.find((option) => option.provider === credential.provider) ??
    defaultConnectionOption
  );
}

function resolveValidateDisabledReason(input: {
  apiKey: string;
  isBusy: boolean;
  label: string;
  providerAccountId: string;
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
  if (!input.providerAccountId.trim()) {
    return "请填写模型或账号标识。";
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
  providerAccountId: string;
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
