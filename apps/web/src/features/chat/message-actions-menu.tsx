"use client";

import { useState } from "react";

import { apiBaseUrl } from "../../lib/api-base-url";

type MessageActionsMenuProps = {
  buttonClassName?: string;
  className?: string;
  conversationId: string;
  diffActionLabel?: string;
  diffActionStatus?: string;
  messageContent: string;
  messageId: string;
  onApplyDiff?: () => void;
  onQuote?: (quoted: string) => void;
  showApplyDiff?: boolean;
  showCopy?: boolean;
  showRegenerate?: boolean;
  statusClassName?: string;
  workspaceId: string;
};

export function MessageActionsMenu({
  buttonClassName,
  className,
  diffActionLabel = "应用 Diff",
  diffActionStatus = "已应用变更。",
  messageContent,
  messageId,
  onApplyDiff,
  onQuote,
  showApplyDiff = true,
  showCopy = true,
  showRegenerate = true,
  statusClassName,
  workspaceId
}: MessageActionsMenuProps) {
  const [status, setStatus] = useState<string | null>(null);
  const actionButtonClassName =
    buttonClassName ??
    "rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50";

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
    setStatus(diffActionStatus);
  }

  return (
    <div
      className={className ?? "inline-flex flex-wrap items-center gap-2"}
      data-testid="message-actions-menu"
      data-message-id={messageId}
    >
      {showCopy ? (
        <button className={actionButtonClassName} type="button" onClick={() => void handleCopy()}>
          复制
        </button>
      ) : null}
      <button className={actionButtonClassName} type="button" onClick={handleQuote}>
        引用
      </button>
      {showRegenerate ? (
        <button className={actionButtonClassName} type="button" onClick={() => void handleRegenerate()}>
          重新生成
        </button>
      ) : null}
      {showApplyDiff ? (
        <button className={actionButtonClassName} type="button" onClick={handleApplyDiff}>
          {diffActionLabel}
        </button>
      ) : null}
      {status ? (
        <span className={statusClassName} data-testid="message-actions-status">
          {status}
        </span>
      ) : null}
    </div>
  );
}
