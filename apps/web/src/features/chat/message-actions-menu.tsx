"use client";

import { useState } from "react";

import { apiBaseUrl } from "../../lib/api-base-url";

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
      setStatus("已复制。");
    } catch {
      setStatus("复制失败。");
    }
  }

  function handleQuote(): void {
    onQuote?.(`> ${messageContent.replace(/\n/g, "\n> ")}\n\n`);
    setStatus("已引用到输入框。");
  }

  async function handleRegenerate(): Promise<void> {
    setStatus("正在请求重新生成...");
    try {
      const response = await fetch(
        `${apiBaseUrl}/messages/${encodeURIComponent(messageId)}/regenerate?workspaceId=${encodeURIComponent(workspaceId)}`,
        { credentials: "include", method: "POST" }
      );
      if (!response.ok) {
        throw new Error(`请求失败（${response.status}）。`);
      }
      setStatus("已加入重新生成队列。");
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "重新生成失败。");
    }
  }

  function handleApplyDiff(): void {
    onApplyDiff?.();
    setStatus("已应用变更。");
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
