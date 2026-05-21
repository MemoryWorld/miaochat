"use client";

import { useState } from "react";

import type { CustomAgent } from "@agenthub/contracts";

export type AgentDraft = {
  avatarUrl: string;
  capabilityTags: string[];
  name: string;
  provider: CustomAgent["provider"];
  systemPrompt: string;
};

type AgentFormProps = {
  busy?: boolean;
  onSubmit: (draft: AgentDraft) => Promise<void>;
};

const providerOptions: Array<{
  label: string;
  value: CustomAgent["provider"];
}> = [
  {
    label: "Codex",
    value: "codex"
  },
  {
    label: "Claude Code",
    value: "claude-code"
  },
  {
    label: "Hermes",
    value: "hermes"
  },
  {
    label: "OpenClaw",
    value: "openclaw"
  },
  {
    label: "Mock",
    value: "mock"
  }
];

export function AgentForm({ busy = false, onSubmit }: AgentFormProps) {
  const [avatarUrl, setAvatarUrl] = useState("");
  const [capabilityTagsText, setCapabilityTagsText] = useState("");
  const [name, setName] = useState("");
  const [provider, setProvider] = useState<CustomAgent["provider"]>("codex");
  const [systemPrompt, setSystemPrompt] = useState("");

  const canSubmit = name.trim().length > 0 && systemPrompt.trim().length > 0 && !busy;

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();

        if (!canSubmit) {
          return;
        }

        await onSubmit({
          avatarUrl: avatarUrl.trim(),
          capabilityTags: capabilityTagsText
            .split(",")
            .map((value) => value.trim())
            .filter((value) => value.length > 0),
          name: name.trim(),
          provider,
          systemPrompt: systemPrompt.trim()
        });

        setAvatarUrl("");
        setCapabilityTagsText("");
        setName("");
        setProvider("codex");
        setSystemPrompt("");
      }}
      style={{
        display: "grid",
        gap: "0.9rem"
      }}
    >
      <label htmlFor="agent-name" style={fieldLabelStyle}>
        Agent name
        <input
          id="agent-name"
          onChange={(event) => {
            setName(event.target.value);
          }}
          placeholder="Release Drafter"
          style={inputStyle}
          type="text"
          value={name}
        />
      </label>

      <label htmlFor="agent-provider" style={fieldLabelStyle}>
        Provider
        <select
          id="agent-provider"
          onChange={(event) => {
            setProvider(event.target.value as CustomAgent["provider"]);
          }}
          style={inputStyle}
          value={provider}
        >
          {providerOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label htmlFor="agent-capability-tags" style={fieldLabelStyle}>
        Capability tags
        <input
          id="agent-capability-tags"
          onChange={(event) => {
            setCapabilityTagsText(event.target.value);
          }}
          placeholder="release, writing"
          style={inputStyle}
          type="text"
          value={capabilityTagsText}
        />
      </label>

      <label htmlFor="agent-avatar-url" style={fieldLabelStyle}>
        Avatar URL
        <input
          id="agent-avatar-url"
          onChange={(event) => {
            setAvatarUrl(event.target.value);
          }}
          placeholder="https://example.com/agent.png"
          style={inputStyle}
          type="url"
          value={avatarUrl}
        />
      </label>

      <label htmlFor="agent-system-prompt" style={fieldLabelStyle}>
        System prompt
        <textarea
          id="agent-system-prompt"
          onChange={(event) => {
            setSystemPrompt(event.target.value);
          }}
          placeholder="Draft release notes and changelog summaries."
          rows={6}
          style={textareaStyle}
          value={systemPrompt}
        />
      </label>

      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
        <p style={{ color: "#475467", fontSize: "0.92rem", lineHeight: 1.6, margin: 0 }}>
          Light custom agents stay prompt-first for Release 1. Tool bindings can be
          attached later through the registry slice.
        </p>
        <button disabled={!canSubmit} style={buttonStyle} type="submit">
          Create agent
        </button>
      </div>
    </form>
  );
}

const buttonStyle = {
  alignSelf: "start",
  background: "#101828",
  border: 0,
  borderRadius: "999px",
  color: "#fff",
  cursor: "pointer",
  font: "inherit",
  fontWeight: 600,
  padding: "0.75rem 1.1rem"
} as const;

const fieldLabelStyle = {
  color: "#344054",
  display: "grid",
  fontSize: "0.95rem",
  fontWeight: 600,
  gap: "0.4rem"
} as const;

const inputStyle = {
  border: "1px solid rgba(15, 23, 42, 0.12)",
  borderRadius: "16px",
  font: "inherit",
  padding: "0.85rem 0.95rem"
} as const;

const textareaStyle = {
  ...inputStyle,
  resize: "vertical"
} as const;
