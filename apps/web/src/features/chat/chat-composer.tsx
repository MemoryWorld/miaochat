"use client";

import { useState } from "react";

import type { ConversationAgentMember } from "@agenthub/contracts";

import { AgentMentionInput } from "./agent-mention-input";

type ChatSendInput = {
  content: string;
  mentionedAgentIds: string[];
};

type ChatComposerProps = {
  disabled?: boolean;
  onSend: (input: ChatSendInput) => Promise<void>;
  participants?: ConversationAgentMember[];
};

export function ChatComposer({
  disabled = false,
  onSend,
  participants = []
}: ChatComposerProps) {
  const [content, setContent] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();

        const trimmed = content.trim();

        if (!trimmed || disabled) {
          return;
        }

        await onSend({
          content: trimmed,
          mentionedAgentIds: selectedAgentId ? [selectedAgentId] : []
        });
        setContent("");
        setSelectedAgentId(null);
      }}
      style={{
        borderTop: "1px solid rgba(15, 23, 42, 0.08)",
        display: "grid",
        gap: "0.75rem",
        marginTop: "1rem",
        paddingTop: "1rem"
      }}
    >
      <AgentMentionInput
        disabled={disabled}
        onSelectAgent={({ agentId, mentionLabel }) => {
          setSelectedAgentId(agentId);
          setContent((current) => replaceLeadingMention(current, mentionLabel));
        }}
        participants={participants}
        selectedAgentId={selectedAgentId}
      />
      <label
        htmlFor="chat-composer-input"
        style={{
          color: "#344054",
          display: "grid",
          fontSize: "0.95rem",
          fontWeight: 600,
          gap: "0.4rem"
        }}
      >
        消息内容
        <textarea
          id="chat-composer-input"
          disabled={disabled}
          onChange={(event) => {
            setContent(event.target.value);
          }}
          placeholder="请告诉 AI 同事下一步需要推进什么。"
          rows={3}
          value={content}
          style={{
            border: "1px solid rgba(15, 23, 42, 0.12)",
            borderRadius: "16px",
            font: "inherit",
            padding: "0.9rem 1rem",
            resize: "vertical"
          }}
        />
      </label>
      <div>
        <button
          disabled={disabled || content.trim().length === 0}
          style={buttonStyle}
          type="submit"
        >
          发送消息
        </button>
      </div>
    </form>
  );
}

const buttonStyle = {
  background: "#101828",
  border: 0,
  borderRadius: "999px",
  color: "#fff",
  cursor: "pointer",
  font: "inherit",
  fontWeight: 600,
  padding: "0.75rem 1.1rem"
} as const;

function replaceLeadingMention(content: string, mentionLabel: string): string {
  const trimmedStart = content.trimStart();
  const withoutExistingMention = trimmedStart.replace(/^@\S+\s*/, "");

  return `${mentionLabel} ${withoutExistingMention}`.trimEnd();
}
