"use client";

import { startTransition, useEffect, useRef, useState } from "react";

import {
  deployCommandResultSchema,
  type Artifact,
  type Conversation,
  type CustomAgent,
  type DeployCommandResult,
  type Message,
  type OrchestratorStatusEventPayload
} from "@agenthub/contracts";

import { AppShell } from "../../components/app-shell";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { useActiveWorkspace } from "../workspaces/use-active-workspace";
import { WorkspaceSwitcher } from "../workspaces/workspace-switcher";
import { NewConversationDialog } from "../conversations/new-conversation-dialog";
import { ChatComposer } from "./chat-composer";
import { parseDeployCommand } from "./deploy-command";
import { ChatThread } from "./chat-thread";
import { useConversationStream } from "./use-conversation-stream";

const apiBaseUrl = "http://localhost:3001";

type LiveAssistantMessage = {
  content: string;
  id: string;
};

export function ChatExperience() {
  const {
    activeWorkspaceId: workspaceId,
    isLoading: isLoadingWorkspaces,
    selectWorkspace,
    workspaces
  } = useActiveWorkspace();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [customAgents, setCustomAgents] = useState<CustomAgent[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isLoadingCustomAgents, setIsLoadingCustomAgents] = useState(false);
  const [isNewConversationOpen, setIsNewConversationOpen] = useState(false);
  const [isPinningMessageId, setIsPinningMessageId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [liveAssistantMessage, setLiveAssistantMessage] =
    useState<LiveAssistantMessage | null>(null);
  const [deployments, setDeployments] = useState<DeployCommandResult[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [artifactsByMessageId, setArtifactsByMessageId] = useState<
    Record<string, Artifact[]>
  >({});
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const processedStreamEventCountRef = useRef(0);

  const stream = useConversationStream({
    conversationId: selectedConversationId,
    workspaceId
  });

  useEffect(() => {
    void loadConversations();
  }, [workspaceId]);

  useEffect(() => {
    setSelectedConversationId(null);
    setMessages([]);
    setArtifactsByMessageId({});
    setLiveAssistantMessage(null);
    setDeployments([]);
    setCustomAgents([]);
    processedStreamEventCountRef.current = 0;
  }, [workspaceId]);

  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([]);
      setArtifactsByMessageId({});
      setLiveAssistantMessage(null);
      setDeployments([]);
      processedStreamEventCountRef.current = 0;
      return;
    }

    processedStreamEventCountRef.current = 0;
    setDeployments([]);
    void loadMessages(selectedConversationId);
  }, [selectedConversationId]);

  useEffect(() => {
    if (!selectedConversationId) {
      processedStreamEventCountRef.current = 0;
      return;
    }

    if (stream.events.length < processedStreamEventCountRef.current) {
      processedStreamEventCountRef.current = 0;
    }

    const nextEvents = stream.events.slice(processedStreamEventCountRef.current);

    if (nextEvents.length === 0) {
      return;
    }

    processedStreamEventCountRef.current = stream.events.length;

    for (const event of nextEvents) {
      startTransition(() => {
        if (event.kind === "conversation.message.started") {
          setLiveAssistantMessage({
            content: "",
            id: event.payload.messageId
          });
          return;
        }

        if (event.kind === "conversation.message.delta") {
          setLiveAssistantMessage((current) => ({
            content:
              current?.id === event.payload.messageId
                ? `${current.content}${event.payload.delta}`
                : event.payload.delta,
            id: event.payload.messageId
          }));
          return;
        }

        if (event.kind === "conversation.message.completed") {
          setLiveAssistantMessage({
            content: event.payload.finalContent,
            id: event.payload.messageId
          });
          void loadMessages(selectedConversationId);
        }
      });
    }
  }, [selectedConversationId, stream.events]);

  const selectedConversation =
    conversations.find((conversation) => conversation.id === selectedConversationId) ?? null;
  const statusEvents = stream.events.flatMap((event) =>
    event.kind === "conversation.status" ? [event.payload as OrchestratorStatusEventPayload] : []
  );

  async function loadConversations(): Promise<void> {
    const response = await fetch(
      `${apiBaseUrl}/conversations?workspaceId=${workspaceId}`
    );
    const payload = (await response.json()) as Conversation[];

    startTransition(() => {
      setConversations(payload);
      setSelectedConversationId((current) => current ?? payload[0]?.id ?? null);
    });
  }

  async function loadMessages(conversationId: string): Promise<void> {
    const response = await fetch(
      `${apiBaseUrl}/messages?conversationId=${conversationId}&workspaceId=${workspaceId}`
    );
    const payload = (await response.json()) as Message[];

    startTransition(() => {
      setMessages((current) => mergeMessages(current, payload, conversationId));
      setLiveAssistantMessage((current) =>
        current && payload.some((message) => message.id === current.id) ? null : current
      );
    });

    await Promise.all(payload.map((message) => loadArtifactsForMessage(message.id)));
  }

  async function loadArtifactsForMessage(messageId: string): Promise<void> {
    try {
      const response = await fetch(
        `${apiBaseUrl}/artifacts?messageId=${messageId}&workspaceId=${workspaceId}`,
        {
          credentials: "include"
        }
      );

      if (!response?.ok) {
        return;
      }

      const payload = (await response.json()) as Artifact[];

      startTransition(() => {
        setArtifactsByMessageId((current) => ({
          ...current,
          [messageId]: payload
        }));
      });
    } catch {
      // Ignore artifact fetch failures so the chat timeline still renders.
    }
  }

  async function loadCustomAgents(): Promise<void> {
    setIsLoadingCustomAgents(true);

    try {
      const response = await fetch(
        `${apiBaseUrl}/custom-agents?workspaceId=${workspaceId}`
      );
      const payload = (await response.json()) as CustomAgent[];

      startTransition(() => {
        setCustomAgents(payload);
      });
    } finally {
      setIsLoadingCustomAgents(false);
    }
  }

  async function createConversation(agentIds: string[]): Promise<void> {
    const response = await fetch(`${apiBaseUrl}/conversations`, {
      body: JSON.stringify({
        agentIds,
        mode: "direct",
        workspaceId
      }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    });

    if (!response.ok) {
      const payload = (await response.json()) as { message?: string };
      throw new Error(payload.message ?? "Failed to create the conversation.");
    }

    const payload = (await response.json()) as Conversation;

    startTransition(() => {
      setConversations((current) => [payload, ...current]);
      setSelectedConversationId(payload.id);
    });
  }

  async function handleCreateConversation(): Promise<void> {
    setErrorMessage(null);
    setIsCreating(true);

    try {
      await createConversation(["agent_mock"]);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to create the mock conversation."
      );
    } finally {
      setIsCreating(false);
    }
  }

  async function handleCreateCustomConversation(agentId: string): Promise<void> {
    setErrorMessage(null);
    setIsCreating(true);

    try {
      await createConversation([agentId]);

      startTransition(() => {
        setIsNewConversationOpen(false);
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to create the custom conversation."
      );
    } finally {
      setIsCreating(false);
    }
  }

  async function handleSend(input: {
    content: string;
    mentionedAgentIds: string[];
  }): Promise<void> {
    if (!selectedConversationId) {
      return;
    }

    setErrorMessage(null);
    setIsSending(true);

    try {
      const deployCommand = parseDeployCommand(input.content);

      if (deployCommand) {
        const response = await fetch(`${apiBaseUrl}/deploys`, {
          body: JSON.stringify({
            conversationId: selectedConversationId,
            targetName: deployCommand.targetName,
            workspaceId
          }),
          headers: {
            "Content-Type": "application/json"
          },
          method: "POST"
        });
        const payload = await response.json();

        if (!response.ok) {
          const message =
            typeof payload === "object" &&
            payload !== null &&
            "message" in payload &&
            typeof payload.message === "string"
              ? payload.message
              : "Failed to trigger the deploy workflow.";
          throw new Error(message);
        }

        const parsedPayload = deployCommandResultSchema.parse(payload);

        startTransition(() => {
          setDeployments((current) => [
            parsedPayload,
            ...current.filter((entry) => entry.deployment.id !== parsedPayload.deployment.id)
          ]);
        });
        return;
      }

      const response = await fetch(`${apiBaseUrl}/messages/send`, {
        body: JSON.stringify({
          content: input.content,
          conversationId: selectedConversationId,
          mentionedAgentIds: input.mentionedAgentIds,
          role: "user",
          workspaceId
        }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });
      const payload = (await response.json()) as Message;

      startTransition(() => {
        setMessages((current) => [...current, payload]);
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to send the message."
      );
    } finally {
      setIsSending(false);
    }
  }

  async function handlePinMessage(messageId: string): Promise<void> {
    if (!selectedConversationId) {
      return;
    }

    const conversationId = selectedConversationId;

    setErrorMessage(null);
    setIsPinningMessageId(messageId);

    try {
      const response = await fetch(
        `${apiBaseUrl}/messages/${messageId}/pin?workspaceId=${workspaceId}`,
        {
          method: "POST"
        }
      );
      const payload = (await response.json()) as {
        message: Message;
        pinnedMessageIds: string[];
      };

      startTransition(() => {
        setMessages((current) =>
          current.map((message) =>
            message.id === payload.message.id ? payload.message : message
          )
        );
        setConversations((current) =>
          current.map((conversation) =>
            conversation.id === conversationId
              ? {
                  ...conversation,
                  pinnedMessageIds: payload.pinnedMessageIds
                }
              : conversation
          )
        );
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to pin the selected message."
      );
    } finally {
      setIsPinningMessageId(null);
    }
  }

  return (
    <AppShell
      sidebar={
        <>
          <Badge className="mb-3" tone="primary">
            Chat Workspace
          </Badge>
          <h1 className="mt-0 text-3xl font-semibold tracking-tight text-slate-950">
            AgentHub
          </h1>
          <WorkspaceSwitcher
            activeWorkspaceId={workspaceId}
            isLoading={isLoadingWorkspaces}
            onSelect={selectWorkspace}
            workspaces={workspaces}
          />
          <p className="text-sm leading-7 text-slate-600">
            Release 1 keeps the mock direct path for smoke checks, while custom agents
            can now be created separately and selected for new sessions.
          </p>
          <a
            className="inline-flex items-center text-sm font-semibold text-sky-700 no-underline transition hover:text-sky-600"
            href="/agents"
          >
            Open agents workspace
          </a>
          <Button
            className="mt-2"
            disabled={isCreating}
            onClick={() => {
              void handleCreateConversation();
            }}
            type="button"
          >
            Start mock conversation
          </Button>
          <NewConversationDialog
            agents={customAgents}
            busy={isCreating}
            isLoading={isLoadingCustomAgents}
            isOpen={isNewConversationOpen}
            onCreate={handleCreateCustomConversation}
            onOpen={async () => {
              if (customAgents.length === 0) {
                await loadCustomAgents();
              }
            }}
            onToggleOpen={setIsNewConversationOpen}
          />
          <div className="mt-4 grid gap-2.5">
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                onClick={() => {
                  setSelectedConversationId(conversation.id);
                }}
                className={`grid gap-1 rounded-3xl border bg-white/80 px-4 py-3 text-left transition hover:bg-white ${
                  conversation.id === selectedConversationId
                    ? "border-sky-200"
                    : "border-slate-200"
                }`}
                type="button"
              >
                <strong className="text-slate-950">{conversation.title}</strong>
                <span className="text-xs text-slate-500">
                  {conversation.participants.map((entry) => entry.agentName).join(", ")}
                </span>
              </button>
            ))}
            {conversations.length === 0 ? (
              <p className="mb-0 text-sm leading-7 text-slate-600">
                No conversations yet. Start the seeded mock direct conversation first.
              </p>
            ) : null}
          </div>
        </>
      }
    >
      <section>
        <div className="mb-4 flex flex-col justify-between gap-4 xl:flex-row xl:items-start">
          <div>
            <h2 className="m-0 text-2xl font-semibold text-slate-950">
              {selectedConversation?.title ?? "Conversation Viewport"}
            </h2>
            <p className="mb-0 mt-2 text-sm leading-7 text-slate-600">
              {selectedConversation
                ? "Send one message to exercise the single-agent mock worker path."
                : "Create the mock conversation to activate the chat thread and SSE stream."}
            </p>
          </div>
          <div className="rounded-full border border-slate-200 px-3 py-2 text-xs font-medium text-slate-500">
            {stream.connectionState}
          </div>
        </div>
        {errorMessage ? (
          <p className="mt-0 text-sm font-medium text-red-700">{errorMessage}</p>
        ) : null}
        <ChatThread
          artifactsByMessageId={artifactsByMessageId}
          connectionState={stream.connectionState}
          deployments={deployments}
          isPinningMessageId={isPinningMessageId}
          liveAssistantMessage={liveAssistantMessage}
          messages={messages}
          onPinMessage={handlePinMessage}
          statusEvents={statusEvents}
        />
        <ChatComposer
          disabled={!selectedConversationId || isSending}
          onSend={handleSend}
          participants={selectedConversation?.participants ?? []}
        />
      </section>
    </AppShell>
  );
}

function mergeMessages(
  currentMessages: Message[],
  nextMessages: Message[],
  conversationId: string
): Message[] {
  const merged = new Map(
    currentMessages
      .filter((message) => message.conversationId === conversationId)
      .map((message) => [message.id, message])
  );

  for (const message of nextMessages) {
    merged.set(message.id, message);
  }

  return [...merged.values()].sort(
    (left, right) =>
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  );
}
