"use client";

import { startTransition, useEffect, useState } from "react";

import type { CustomAgent } from "@agenthub/contracts";

import { AppShell } from "../../components/app-shell";
import { Badge } from "../../components/ui/badge";
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
          <Badge className="mb-3" tone="primary">
            Agent Registry
          </Badge>
          <h1 className="mt-0 text-3xl font-semibold tracking-tight text-slate-950">
            AgentHub
          </h1>
          <p className="text-sm leading-7 text-slate-600">
            Define light custom agents with workspace-scoped prompts, then reuse them
            in new conversation flows without touching provider adapters.
          </p>
          <a
            className="inline-flex items-center text-sm font-semibold text-sky-700 no-underline transition hover:text-sky-600"
            href="/"
          >
            Back to chat workspace
          </a>
          <Badge className="mt-4" tone="default">
            Workspace: {workspaceId}
          </Badge>
        </>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <section className="rounded-[28px] border border-white/70 bg-slate-50/80 p-5 shadow-sm">
          <h2 className="mt-0 text-2xl font-semibold text-slate-950">Custom agents</h2>
          <p className="text-sm leading-7 text-slate-600">
            Capture the behavior, provider target, and capability tags for light agents
            that can be selected directly in the web client.
          </p>
          {errorMessage ? <p className="text-sm font-medium text-red-700">{errorMessage}</p> : null}
          <AgentForm busy={isSaving} onSubmit={handleCreateAgent} />
        </section>

        <section className="rounded-[28px] border border-white/70 bg-slate-50/80 p-5 shadow-sm">
          <h2 className="mt-0 text-2xl font-semibold text-slate-950">Saved agents</h2>
          <AgentList agents={agents} />
        </section>
      </div>
    </AppShell>
  );
}
