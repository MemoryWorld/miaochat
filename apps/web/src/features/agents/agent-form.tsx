"use client";

import { useState } from "react";

import type { CustomAgent } from "@agenthub/contracts";

import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import { Textarea } from "../../components/ui/textarea";

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
      className="grid gap-4"
    >
      <label className={fieldLabelClassName} htmlFor="agent-name">
        Agent name
        <Input
          id="agent-name"
          onChange={(event) => {
            setName(event.target.value);
          }}
          placeholder="Release Drafter"
          type="text"
          value={name}
        />
      </label>

      <label className={fieldLabelClassName} htmlFor="agent-provider">
        Provider
        <Select
          id="agent-provider"
          onChange={(event) => {
            setProvider(event.target.value as CustomAgent["provider"]);
          }}
          value={provider}
        >
          {providerOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </label>

      <label className={fieldLabelClassName} htmlFor="agent-capability-tags">
        Capability tags
        <Input
          id="agent-capability-tags"
          onChange={(event) => {
            setCapabilityTagsText(event.target.value);
          }}
          placeholder="release, writing"
          type="text"
          value={capabilityTagsText}
        />
      </label>

      <label className={fieldLabelClassName} htmlFor="agent-avatar-url">
        Avatar URL
        <Input
          id="agent-avatar-url"
          onChange={(event) => {
            setAvatarUrl(event.target.value);
          }}
          placeholder="https://example.com/agent.png"
          type="url"
          value={avatarUrl}
        />
      </label>

      <label className={fieldLabelClassName} htmlFor="agent-system-prompt">
        System prompt
        <Textarea
          className="min-h-36 resize-y"
          id="agent-system-prompt"
          onChange={(event) => {
            setSystemPrompt(event.target.value);
          }}
          placeholder="Draft release notes and changelog summaries."
          rows={6}
          value={systemPrompt}
        />
      </label>

      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <p className="m-0 text-sm leading-7 text-slate-600">
          Light custom agents stay prompt-first for Release 1. Tool bindings can be
          attached later through the registry slice.
        </p>
        <Button className="shrink-0" disabled={!canSubmit} type="submit">
          Create agent
        </Button>
      </div>
    </form>
  );
}

const fieldLabelClassName = "grid gap-2 text-sm font-semibold text-slate-700";
