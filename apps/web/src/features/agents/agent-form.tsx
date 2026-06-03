"use client";

import { useState } from "react";

import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";

export type AgentDraft = {
  avatarUrl: string;
  capabilityTags: string[];
  name: string;
  systemPrompt: string;
};

type AgentFormProps = {
  busy?: boolean;
  onSubmit: (draft: AgentDraft) => Promise<void>;
};

export function AgentForm({ busy = false, onSubmit }: AgentFormProps) {
  const [avatarUrl, setAvatarUrl] = useState("");
  const [capabilityTagsText, setCapabilityTagsText] = useState("");
  const [name, setName] = useState("");
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
          systemPrompt: systemPrompt.trim()
        });

        setAvatarUrl("");
        setCapabilityTagsText("");
        setName("");
        setSystemPrompt("");
      }}
      className="grid gap-4"
    >
      <label className={fieldLabelClassName} htmlFor="agent-name">
        AI 同事名称
        <Input
          id="agent-name"
          onChange={(event) => {
            setName(event.target.value);
          }}
          placeholder="例如：交付文档助手"
          type="text"
          value={name}
        />
      </label>

      <label className={fieldLabelClassName} htmlFor="agent-capability-tags">
        能力标签
        <Input
          id="agent-capability-tags"
          onChange={(event) => {
            setCapabilityTagsText(event.target.value);
          }}
          placeholder="例如：交付, 文档, 跟进"
          type="text"
          value={capabilityTagsText}
        />
      </label>

      <label className={fieldLabelClassName} htmlFor="agent-avatar-url">
        头像 URL
        <Input
          id="agent-avatar-url"
          onChange={(event) => {
            setAvatarUrl(event.target.value);
          }}
          placeholder="https://example.com/avatar.png"
          type="url"
          value={avatarUrl}
        />
      </label>

      <label className={fieldLabelClassName} htmlFor="agent-system-prompt">
        角色职责说明
        <Textarea
          className="min-h-36 resize-y"
          id="agent-system-prompt"
          onChange={(event) => {
            setSystemPrompt(event.target.value);
          }}
          placeholder="说明这个 AI 同事在工作区里负责什么、遇到什么边界时该停下来、输出结果应该长什么样。"
          rows={6}
          value={systemPrompt}
        />
      </label>

      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <p className="m-0 text-sm leading-7 text-slate-600">
          先把角色、边界和职责写清楚，后续可以在同事详情里继续补充工具、记忆和输出偏好。
        </p>
        <Button className="shrink-0" disabled={!canSubmit} type="submit">
          保存 AI 同事
        </Button>
      </div>
    </form>
  );
}

const fieldLabelClassName = "grid gap-2 text-sm font-semibold text-slate-700";
