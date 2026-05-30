"use client";

import { useEffect, useState } from "react";

import type { Conversation } from "@agenthub/contracts";

import { apiBaseUrl } from "../../lib/api-base-url";

type ConversationListProps = {
  onSelect: (conversationId: string) => void;
  workspaceId: string;
};

export function ConversationList({ onSelect, workspaceId }: ConversationListProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [search, setSearch] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
  }, [workspaceId, includeArchived]);

  async function refresh(): Promise<void> {
    const params = new URLSearchParams({ workspaceId });
    if (search.trim().length > 0) {
      params.set("search", search.trim());
    }
    if (includeArchived) {
      params.set("includeArchived", "true");
    }
    const response = await fetch(`${apiBaseUrl}/conversations?${params.toString()}`, {
      credentials: "include"
    });
    if (response.ok) {
      setConversations((await response.json()) as Conversation[]);
    }
  }

  async function action(conversationId: string, path: "pin" | "unpin" | "archive" | "restore") {
    setBusyId(conversationId);
    try {
      await fetch(
        `${apiBaseUrl}/conversations/${encodeURIComponent(conversationId)}/${path}?workspaceId=${encodeURIComponent(workspaceId)}`,
        { credentials: "include", method: "POST" }
      );
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section data-testid="conversation-list">
      <input
        aria-label="Search conversations"
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            void refresh();
          }
        }}
      />
      <label>
        <input
          type="checkbox"
          checked={includeArchived}
          onChange={(event) => setIncludeArchived(event.target.checked)}
        />
        Show archived
      </label>
      <ul>
        {conversations.map((conversation) => (
          <li
            key={conversation.id}
            data-conversation-id={conversation.id}
            data-pinned={conversation.isPinned ? "true" : "false"}
            data-archived={conversation.archivedAt ? "true" : "false"}
          >
            <button type="button" onClick={() => onSelect(conversation.id)}>
              {conversation.isPinned ? "📌 " : ""}
              {conversation.title}
              {conversation.archivedAt ? " (archived)" : ""}
            </button>
            <button
              type="button"
              disabled={busyId === conversation.id}
              onClick={() =>
                void action(conversation.id, conversation.isPinned ? "unpin" : "pin")
              }
            >
              {conversation.isPinned ? "Unpin" : "Pin"}
            </button>
            <button
              type="button"
              disabled={busyId === conversation.id}
              onClick={() =>
                void action(
                  conversation.id,
                  conversation.archivedAt ? "restore" : "archive"
                )
              }
            >
              {conversation.archivedAt ? "Restore" : "Archive"}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
