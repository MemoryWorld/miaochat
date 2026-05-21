"use client";

import { useEffect, useState } from "react";

import type { CustomAgent } from "@agenthub/contracts";

type NewConversationDialogProps = {
  agents: CustomAgent[];
  busy?: boolean;
  isLoading?: boolean;
  isOpen: boolean;
  onCreate: (agentId: string) => Promise<void>;
  onOpen: () => Promise<void> | void;
  onToggleOpen: (open: boolean) => void;
};

export function NewConversationDialog({
  agents,
  busy = false,
  isLoading = false,
  isOpen,
  onCreate,
  onOpen,
  onToggleOpen
}: NewConversationDialogProps) {
  const [selectedAgentId, setSelectedAgentId] = useState("");

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setSelectedAgentId((current) => {
      if (current && agents.some((agent) => agent.id === current)) {
        return current;
      }

      return agents[0]?.id ?? "";
    });
  }, [agents, isOpen]);

  return (
    <div
      style={{
        background: "rgba(248, 250, 252, 0.7)",
        border: "1px solid rgba(15, 23, 42, 0.08)",
        borderRadius: "20px",
        display: "grid",
        gap: "0.85rem",
        marginTop: "0.9rem",
        padding: "1rem"
      }}
    >
      <div
        style={{
          alignItems: "center",
          display: "flex",
          gap: "0.75rem",
          justifyContent: "space-between"
        }}
      >
        <div>
          <strong style={{ color: "#101828" }}>Custom agent conversations</strong>
          <div style={{ color: "#475467", fontSize: "0.9rem", marginTop: "0.2rem" }}>
            Start a direct session from a saved custom agent.
          </div>
        </div>
        <button
          onClick={() => {
            if (!isOpen) {
              void onOpen();
            }
            onToggleOpen(!isOpen);
          }}
          style={secondaryButtonStyle}
          type="button"
        >
          {isOpen ? "Close" : "New conversation"}
        </button>
      </div>

      {isOpen ? (
        <form
          onSubmit={async (event) => {
            event.preventDefault();

            if (!selectedAgentId || busy || isLoading) {
              return;
            }

            await onCreate(selectedAgentId);
          }}
          style={{
            display: "grid",
            gap: "0.85rem"
          }}
        >
          {isLoading ? (
            <p style={{ color: "#475467", lineHeight: 1.6, margin: 0 }}>
              Loading saved custom agents...
            </p>
          ) : agents.length === 0 ? (
            <p style={{ color: "#475467", lineHeight: 1.6, margin: 0 }}>
              No custom agents are available yet. Create one from{" "}
              <a href="/agents" style={{ color: "#0b6eff" }}>
                the agents workspace
              </a>
              .
            </p>
          ) : (
            <>
              <label htmlFor="new-conversation-agent" style={fieldLabelStyle}>
                Agent
                <select
                  id="new-conversation-agent"
                  onChange={(event) => {
                    setSelectedAgentId(event.target.value);
                  }}
                  style={selectStyle}
                  value={selectedAgentId}
                >
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name} · {agent.provider}
                    </option>
                  ))}
                </select>
              </label>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  disabled={!selectedAgentId || busy}
                  style={primaryButtonStyle}
                  type="submit"
                >
                  Create conversation
                </button>
              </div>
            </>
          )}
        </form>
      ) : null}
    </div>
  );
}

const fieldLabelStyle = {
  color: "#344054",
  display: "grid",
  fontSize: "0.95rem",
  fontWeight: 600,
  gap: "0.4rem"
} as const;

const primaryButtonStyle = {
  background: "#101828",
  border: 0,
  borderRadius: "999px",
  color: "#fff",
  cursor: "pointer",
  font: "inherit",
  fontWeight: 600,
  padding: "0.75rem 1.1rem"
} as const;

const secondaryButtonStyle = {
  background: "rgba(255, 255, 255, 0.9)",
  border: "1px solid rgba(15, 23, 42, 0.08)",
  borderRadius: "999px",
  color: "#101828",
  cursor: "pointer",
  font: "inherit",
  fontWeight: 600,
  padding: "0.7rem 1rem"
} as const;

const selectStyle = {
  border: "1px solid rgba(15, 23, 42, 0.12)",
  borderRadius: "16px",
  font: "inherit",
  padding: "0.85rem 0.95rem"
} as const;
