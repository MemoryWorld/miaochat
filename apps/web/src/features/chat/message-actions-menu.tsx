"use client";

import { useState } from "react";

const apiBaseUrl = "http://localhost:3001";

type MessageActionsMenuProps = {
  conversationId: string;
  messageContent: string;
  messageId: string;
  onApplyDiff?: () => void;
  onQuote?: (quoted: string) => void;
  workspaceId: string;
};

export function MessageActionsMenu({
  messageContent,
  messageId,
  onApplyDiff,
  onQuote,
  workspaceId
}: MessageActionsMenuProps) {
  const [status, setStatus] = useState<string | null>(null);

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(messageContent);
      setStatus("Copied to clipboard.");
    } catch {
      setStatus("Copy failed.");
    }
  }

  function handleQuote(): void {
    onQuote?.(`> ${messageContent.replace(/\n/g, "\n> ")}\n\n`);
    setStatus("Quoted into composer.");
  }

  async function handleRegenerate(): Promise<void> {
    setStatus("Requesting regeneration…");
    try {
      const response = await fetch(
        `${apiBaseUrl}/messages/${encodeURIComponent(messageId)}/regenerate?workspaceId=${encodeURIComponent(workspaceId)}`,
        { credentials: "include", method: "POST" }
      );
      if (!response.ok) {
        throw new Error(`Failed (${response.status}).`);
      }
      setStatus("Regeneration queued.");
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Regeneration failed.");
    }
  }

  function handleApplyDiff(): void {
    onApplyDiff?.();
    setStatus("Diff applied.");
  }

  return (
    <div data-testid="message-actions-menu" data-message-id={messageId}>
      <button type="button" onClick={() => void handleCopy()}>
        Copy
      </button>
      <button type="button" onClick={handleQuote}>
        Quote
      </button>
      <button type="button" onClick={() => void handleRegenerate()}>
        Regenerate
      </button>
      <button type="button" onClick={handleApplyDiff}>
        Apply diff
      </button>
      {status ? <span data-testid="message-actions-status">{status}</span> : null}
    </div>
  );
}
