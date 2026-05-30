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
      <div className="text-sm text-slate-500" data-testid="presence-bar" aria-label="频道在线状态">
        <span>当前没有其他成员正在输入。</span>
      </div>
    );
  }

  return (
    <div className="text-sm text-slate-600" data-testid="presence-bar" aria-label="频道在线状态">
      <ul className="m-0 grid gap-1 p-0">
        {snapshot.participants.map((participant) => (
          <li className="list-none" key={participant.userId} data-user-id={participant.userId}>
            {participant.userId}
            {participant.action === "typing" ? " 正在输入..." : ""}
            {participant.lastReadMessageId
              ? ` · 已读到 ${participant.lastReadMessageId}`
              : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}
