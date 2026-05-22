"use client";

import { useEffect, useState } from "react";

import type { PresenceSnapshot } from "@agenthub/contracts";

const apiBaseUrl = "http://localhost:3001";

type PresenceBarProps = {
  conversationId: string;
  workspaceId: string;
};

export function PresenceBar({ conversationId, workspaceId }: PresenceBarProps) {
  const [snapshot, setSnapshot] = useState<PresenceSnapshot>({
    conversationId,
    participants: []
  });

  useEffect(() => {
    let cancelled = false;
    async function refresh(): Promise<void> {
      const response = await fetch(
        `${apiBaseUrl}/streams/${encodeURIComponent(conversationId)}/presence?workspaceId=${encodeURIComponent(workspaceId)}`,
        { credentials: "include" }
      );
      if (!cancelled && response.ok) {
        setSnapshot((await response.json()) as PresenceSnapshot);
      }
    }
    void refresh();
    const interval = window.setInterval(refresh, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [conversationId, workspaceId]);

  if (snapshot.participants.length === 0) {
    return (
      <div data-testid="presence-bar" aria-label="Presence">
        <span>No one else is here.</span>
      </div>
    );
  }

  return (
    <div data-testid="presence-bar" aria-label="Presence">
      <ul>
        {snapshot.participants.map((participant) => (
          <li key={participant.userId} data-user-id={participant.userId}>
            {participant.userId}
            {participant.action === "typing" ? " (typing…)" : ""}
            {participant.lastReadMessageId
              ? ` · read up to ${participant.lastReadMessageId}`
              : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}
