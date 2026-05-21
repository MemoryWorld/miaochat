"use client";

import { startTransition, useEffect, useState } from "react";

import type { CustomAgent } from "@agenthub/contracts";

import { AppShell } from "../../components/app-shell";
import { AgentForm, type AgentDraft } from "../../features/agents/agent-form";
import { AgentList } from "../../features/agents/agent-list";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
const workspaceId = "default-workspace";

export default function AgentsPage() {
  const [agents, setAgents] = useState<CustomAgent[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    void loadAgents();
  }, []);

  async function loadAgents() {
    const response = await fetch(
      `${apiBaseUrl}/custom-agents?workspaceId=${workspaceId}`
    );
    const payload = (await response.json()) as CustomAgent[];

    startTransition(() => {
      setAgents(payload);
    });
  }

  async function handleCreateAgent(draft: AgentDraft) {
    setErrorMessage(null);
    setIsSaving(true);

    try {
      const response = await fetch(`${apiBaseUrl}/custom-agents`, {
        body: JSON.stringify({
          avatarUrl: draft.avatarUrl.length > 0 ? draft.avatarUrl : null,
          capabilityTags: draft.capabilityTags,
          name: draft.name,
          provider: draft.provider,
          systemPrompt: draft.systemPrompt,
          toolBindings: [],
          workspaceId
        }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });

      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        throw new Error(payload.message ?? "Failed to create the custom agent.");
      }

      await loadAgents();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to create the custom agent."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AppShell
      sidebar={
        <>
          <h1 style={{ marginTop: 0 }}>AgentHub</h1>
          <p style={{ color: "#475467", lineHeight: 1.6 }}>
            Define light custom agents with workspace-scoped prompts, then reuse them
            in new conversation flows without touching provider adapters.
          </p>
          <a href="/" style={navLinkStyle}>
            Back to chat workspace
          </a>
          <div style={workspaceBadgeStyle}>Workspace: {workspaceId}</div>
        </>
      }
    >
      <div
        style={{
          display: "grid",
          gap: "1rem",
          gridTemplateColumns: "minmax(0, 1.1fr) minmax(320px, 0.9fr)"
        }}
      >
        <section style={panelStyle}>
          <h2 style={{ marginTop: 0 }}>Custom agents</h2>
          <p style={{ color: "#475467", lineHeight: 1.6 }}>
            Capture the behavior, provider target, and capability tags for light agents
            that can be selected directly in the web client.
          </p>
          {errorMessage ? <p style={{ color: "#b42318" }}>{errorMessage}</p> : null}
          <AgentForm busy={isSaving} onSubmit={handleCreateAgent} />
        </section>

        <section style={panelStyle}>
          <h2 style={{ marginTop: 0 }}>Saved agents</h2>
          <AgentList agents={agents} />
        </section>
      </div>
    </AppShell>
  );
}

const navLinkStyle = {
  color: "#0b6eff",
  display: "inline-block",
  fontWeight: 600,
  marginTop: "0.2rem",
  textDecoration: "none"
} as const;

const panelStyle = {
  background: "rgba(248, 250, 252, 0.84)",
  border: "1px solid rgba(15, 23, 42, 0.08)",
  borderRadius: "24px",
  padding: "1.25rem"
} as const;

const workspaceBadgeStyle = {
  background: "#101828",
  borderRadius: "999px",
  color: "#f8fafc",
  display: "inline-block",
  fontSize: "0.85rem",
  fontWeight: 700,
  marginTop: "1rem",
  padding: "0.6rem 0.9rem"
} as const;
