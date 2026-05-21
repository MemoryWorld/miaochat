"use client";

import { startTransition, useEffect, useState } from "react";

import type { Conversation, Message } from "@agenthub/contracts";

import { AppShell } from "../../components/app-shell";
import { ChatComposer } from "./chat-composer";
import { ChatThread } from "./chat-thread";
import { useConversationStream } from "./use-conversation-stream";

const apiBaseUrl = "http://localhost:3001";
const workspaceId = "default-workspace";

type LiveAssistantMessage = {
  content: string;
  id: string;
};

export function ChatExperience() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isPinningMessageId, setIsPinningMessageId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [liveAssistantMessage, setLiveAssistantMessage] =
    useState<LiveAssistantMessage | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);

  const stream = useConversationStream({
    conversationId: selectedConversationId,
    workspaceId
  });

  useEffect(() => {
    void loadConversations();
  }, []);

  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([]);
      setLiveAssistantMessage(null);
      return;
    }

    void loadMessages(selectedConversationId);
  }, [selectedConversationId]);

  useEffect(() => {
    if (!selectedConversationId || !stream.lastEvent) {
      return;
    }

    const event = stream.lastEvent;

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
  }, [selectedConversationId, stream.lastEvent]);

  const selectedConversation =
    conversations.find((conversation) => conversation.id === selectedConversationId) ?? null;

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
  }

  async function handleCreateConversation(): Promise<void> {
    setErrorMessage(null);
    setIsCreating(true);

    try {
      const response = await fetch(`${apiBaseUrl}/conversations`, {
        body: JSON.stringify({
          agentIds: ["agent_mock"],
          mode: "direct",
          workspaceId
        }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });
      const payload = (await response.json()) as Conversation;

      startTransition(() => {
        setConversations((current) => [payload, ...current]);
        setSelectedConversationId(payload.id);
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to create the mock conversation."
      );
    } finally {
      setIsCreating(false);
    }
  }

  async function handleSend(content: string): Promise<void> {
    if (!selectedConversationId) {
      return;
    }

    setErrorMessage(null);
    setIsSending(true);

    try {
      const response = await fetch(`${apiBaseUrl}/messages/send`, {
        body: JSON.stringify({
          content,
          conversationId: selectedConversationId,
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
          <h1 style={{ marginTop: 0 }}>AgentHub</h1>
          <p style={{ color: "#475467", lineHeight: 1.6 }}>
            Release 1 mock slice: start one seeded mock conversation and verify the
            browser-to-worker loop before group orchestration lands.
          </p>
          <button
            disabled={isCreating}
            onClick={() => {
              void handleCreateConversation();
            }}
            style={primaryButtonStyle}
            type="button"
          >
            Start mock conversation
          </button>
          <div
            style={{
              display: "grid",
              gap: "0.6rem",
              marginTop: "1rem"
            }}
          >
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                onClick={() => {
                  setSelectedConversationId(conversation.id);
                }}
                style={{
                  ...conversationButtonStyle,
                  borderColor:
                    conversation.id === selectedConversationId
                      ? "rgba(11, 110, 255, 0.28)"
                      : "rgba(15, 23, 42, 0.08)"
                }}
                type="button"
              >
                <strong style={{ color: "#101828" }}>{conversation.title}</strong>
                <span style={{ color: "#475467", fontSize: "0.85rem" }}>
                  {conversation.participants.map((entry) => entry.agentName).join(", ")}
                </span>
              </button>
            ))}
            {conversations.length === 0 ? (
              <p style={{ color: "#475467", lineHeight: 1.6, marginBottom: 0 }}>
                No conversations yet. Start the seeded mock direct conversation first.
              </p>
            ) : null}
          </div>
        </>
      }
    >
      <section>
        <div
          style={{
            alignItems: "start",
            display: "flex",
            justifyContent: "space-between",
            gap: "1rem",
            marginBottom: "1rem"
          }}
        >
          <div>
            <h2 style={{ margin: 0 }}>
              {selectedConversation?.title ?? "Conversation Viewport"}
            </h2>
            <p style={{ color: "#475467", lineHeight: 1.6, marginBottom: 0 }}>
              {selectedConversation
                ? "Send one message to exercise the single-agent mock worker path."
                : "Create the mock conversation to activate the chat thread and SSE stream."}
            </p>
          </div>
          <div
            style={{
              border: "1px solid rgba(15, 23, 42, 0.08)",
              borderRadius: "999px",
              color: "#475467",
              fontSize: "0.82rem",
              padding: "0.45rem 0.75rem"
            }}
          >
            {stream.connectionState}
          </div>
        </div>
        {errorMessage ? (
          <p style={{ color: "#b42318", marginTop: 0 }}>{errorMessage}</p>
        ) : null}
        <ChatThread
          connectionState={stream.connectionState}
          isPinningMessageId={isPinningMessageId}
          liveAssistantMessage={liveAssistantMessage}
          messages={messages}
          onPinMessage={handlePinMessage}
        />
        <ChatComposer
          disabled={!selectedConversationId || isSending}
          onSend={handleSend}
        />
      </section>
    </AppShell>
  );
}

const primaryButtonStyle = {
  background: "#101828",
  border: 0,
  borderRadius: "999px",
  color: "#fff",
  cursor: "pointer",
  font: "inherit",
  fontWeight: 600,
  marginTop: "0.4rem",
  padding: "0.75rem 1rem"
} as const;

const conversationButtonStyle = {
  background: "rgba(255, 255, 255, 0.74)",
  border: "1px solid rgba(15, 23, 42, 0.08)",
  borderRadius: "18px",
  cursor: "pointer",
  display: "grid",
  gap: "0.35rem",
  padding: "0.8rem 0.9rem",
  textAlign: "left"
} as const;

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
