"use client";

import type { ConversationAgentMember } from "@agenthub/contracts";

type AgentMentionInputProps = {
  disabled?: boolean;
  onSelectAgent: (input: { agentId: string; mentionLabel: string }) => void;
  participants: ConversationAgentMember[];
  selectedAgentId: string | null;
};

export function AgentMentionInput({
  disabled = false,
  onSelectAgent,
  participants,
  selectedAgentId
}: AgentMentionInputProps) {
  if (participants.length < 2) {
    return null;
  }

  return (
    <div
      style={{
        display: "grid",
        gap: "0.55rem"
      }}
    >
      <div
        style={{
          color: "#475467",
          fontSize: "0.82rem",
          fontWeight: 600
        }}
      >
        Target an agent
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.5rem"
        }}
      >
        {participants.map((participant) => {
          const mentionLabel = buildMentionLabel(participant.agentName);
          const isSelected = participant.agentId === selectedAgentId;

          return (
            <button
              disabled={disabled}
              key={participant.agentId}
              onClick={() => {
                onSelectAgent({
                  agentId: participant.agentId,
                  mentionLabel
                });
              }}
              style={{
                background: isSelected ? "rgba(11, 110, 255, 0.12)" : "rgba(15, 23, 42, 0.06)",
                border: "1px solid rgba(15, 23, 42, 0.08)",
                borderRadius: "999px",
                color: isSelected ? "#175cd3" : "#344054",
                cursor: disabled ? "default" : "pointer",
                font: "inherit",
                fontSize: "0.82rem",
                fontWeight: 600,
                padding: "0.4rem 0.7rem"
              }}
              type="button"
            >
              {mentionLabel}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function buildMentionLabel(agentName: string): string {
  return `@${agentName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}`;
}
