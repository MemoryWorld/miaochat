"use client";

import { useState } from "react";

import type { CreateCustomAgentInput } from "@agenthub/contracts";

import { apiBaseUrl } from "../../lib/api-base-url";
import { readApiErrorMessage } from "../../lib/api-errors";
import { ToolBindingPicker, type ToolBindingDraft } from "./tool-binding-picker";

const availableTools = ["github", "shell", "browser", "filesystem"] as const;
const runtimeProviders: Array<{
  label: string;
  value: Extract<
    CreateCustomAgentInput["provider"],
    "claude-code" | "codex" | "opencode"
  >;
}> = [
  { label: "国产模型 / OpenCode", value: "opencode" },
  { label: "Codex", value: "codex" },
  { label: "Claude Code", value: "claude-code" }
];

type HeavyAgentFormProps = {
  onCreated?: (agentId: string) => void;
  workspaceId: string;
};

export function HeavyAgentForm({ onCreated, workspaceId }: HeavyAgentFormProps) {
  const [name, setName] = useState("");
  const [provider, setProvider] = useState<(typeof runtimeProviders)[number]["value"]>(
    "opencode"
  );
  const [systemPrompt, setSystemPrompt] = useState("");
  const [bindings, setBindings] = useState<ToolBindingDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(): Promise<void> {
    if (!name.trim() || !systemPrompt.trim()) {
      setError("请填写 AI 同事名称和职责说明。");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/custom-agents`, {
        body: JSON.stringify({
          capabilityTags: [],
          name: name.trim(),
          provider,
          systemPrompt: systemPrompt.trim(),
          toolBindings: bindings,
          workspaceId
        }),
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          message?: string;
        };
        throw new Error(readApiErrorMessage(payload, `创建失败（${response.status}）。`));
      }
      const created = (await response.json()) as { id: string };
      onCreated?.(created.id);
      setName("");
      setSystemPrompt("");
      setBindings([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "创建 AI 同事失败。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      data-testid="heavy-agent-form"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      <label>
        AI 同事名称
        <input
          aria-label="AI 同事名称"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label>
        运行 Provider
        <select
          aria-label="运行 Provider"
          value={provider}
          onChange={(event) =>
            setProvider(event.target.value as (typeof runtimeProviders)[number]["value"])
          }
        >
          {runtimeProviders.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        职责说明
        <textarea
          aria-label="职责说明"
          value={systemPrompt}
          onChange={(event) => setSystemPrompt(event.target.value)}
        />
      </label>
      <ToolBindingPicker
        availableTools={[...availableTools]}
        bindings={bindings}
        onChange={setBindings}
      />
      {error ? <p role="alert">{error}</p> : null}
      <button type="submit" disabled={busy}>
        {busy ? "创建中..." : "创建 AI 同事"}
      </button>
    </form>
  );
}
