"use client";

import {
  sanitizeAssistantVisibleContent,
  type Artifact,
  type Message,
  type RuntimeArtifactStatus
} from "@agenthub/contracts";

import { Avatar } from "../../components/ui/avatar";
import { cn } from "../../lib/cn";
import { ArtifactCard } from "../artifacts/artifact-card";
import { MarkdownContent } from "./markdown-content";
import { MessageActionsMenu } from "./message-actions-menu";
import { PinMessageAction } from "./pin-message-action";

type ChatMessageProps = {
  authorLabel?: string;
  artifacts: Artifact[];
  artifactStatuses?: RuntimeArtifactStatus[];
  isGroupedWithPrevious?: boolean;
  isPinPending: boolean;
  isPinDisabled: boolean;
  message: Message;
  onApplyDiff?: (message: Message) => Promise<string | void> | string | void;
  onPin: () => void;
  onQuote?: (quoted: string) => void;
  onReply?: (message: Message) => void;
};

export function ChatMessage({
  authorLabel,
  artifacts,
  artifactStatuses = [],
  isGroupedWithPrevious = false,
  isPinDisabled,
  isPinPending,
  message,
  onApplyDiff,
  onPin,
  onQuote,
  onReply
}: ChatMessageProps) {
  const isUser = message.role === "user";
  const visibleContent = isUser
    ? message.content
    : sanitizeAssistantVisibleContent(message.content);
  const hasDiffArtifact = artifacts.some((artifact) => artifact.kind === "diff");
  const displayLabel = authorLabel ?? message.role;

  return (
    <article
      className={cn(
        "group flex w-full gap-2.5",
        isUser ? "flex-row-reverse" : "flex-row",
        isGroupedWithPrevious ? "mt-0.5" : "mt-3"
      )}
      data-message-id={message.id}
      data-message-role={message.role}
      id={`message-${message.id}`}
    >
      {!isUser ? (
        <span className={cn("shrink-0", isGroupedWithPrevious && "invisible")}>
          <Avatar name={displayLabel} size="sm" />
        </span>
      ) : null}

      <div
        className={cn(
          "flex min-w-0 max-w-[76%] flex-col",
          isUser ? "items-end" : "items-start"
        )}
      >
        {!isGroupedWithPrevious && !isUser ? (
          <div className="mb-1 flex items-baseline gap-2 px-1">
            <span className="text-[13px] font-semibold text-foreground">{displayLabel}</span>
            <time
              className="text-[11px] text-muted-foreground"
              dateTime={new Date(message.createdAt).toISOString()}
            >
              {formatMessageTime(message.createdAt)}
            </time>
          </div>
        ) : null}

        <div
          className={cn(
            "relative rounded-[1.15rem] px-3.5 py-2.5 text-[15px] leading-relaxed",
            isUser
              ? "bg-[#007aff] text-white"
              : "bg-white text-foreground shadow-card"
          )}
        >
          <MarkdownContent content={visibleContent} tone={isUser ? "dark" : "light"} />

          {artifactStatuses.length > 0 ? (
            <div
              aria-label={`Markdown file status for message ${message.id}`}
              aria-live="polite"
              className="mt-2.5 grid gap-1.5"
              data-message-artifact-statuses
            >
              {artifactStatuses.map((status) => (
                <div
                  className={cn(
                    "rounded-lg px-2.5 py-1.5 text-xs font-medium leading-relaxed",
                    runtimeArtifactStatusClass(status.status)
                  )}
                  key={`${status.type}:${status.title}`}
                >
                  <div>{formatRuntimeArtifactStatus(status)}</div>
                  {status.status === "failed" && status.error ? (
                    <div className="opacity-80">{status.error}</div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {artifacts.length > 0 ? (
            <div
              aria-label={`Artifacts attached to message ${message.id}`}
              className="mt-2.5 grid gap-2"
              data-message-artifacts
            >
              {artifacts.map((artifact) => (
                <ArtifactCard
                  artifact={artifact}
                  conversationId={message.conversationId}
                  key={artifact.id}
                />
              ))}
            </div>
          ) : null}
        </div>

        <div
          className={cn(
            "mt-1 flex flex-wrap items-center gap-1 px-1 text-xs opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100",
            isUser ? "flex-row-reverse" : "flex-row"
          )}
        >
          {isUser && !isGroupedWithPrevious ? (
            <time
              className="text-[11px] text-muted-foreground"
              dateTime={new Date(message.createdAt).toISOString()}
            >
              {formatMessageTime(message.createdAt)}
            </time>
          ) : null}
          <button
            className={actionClassName}
            onClick={() => {
              void navigator.clipboard?.writeText(visibleContent);
            }}
            type="button"
          >
            复制
          </button>
          <button
            className={actionClassName}
            onClick={() => onReply?.(message)}
            type="button"
          >
            回复
          </button>
          <PinMessageAction
            disabled={isPinDisabled}
            isPending={isPinPending}
            isPinned={message.isPinned}
            onPin={onPin}
            tone="light"
          />
          <MessageActionsMenu
            buttonClassName={actionClassName}
            conversationId={message.conversationId}
            diffActionLabel="应用 Diff"
            diffActionStatus="Diff 已应用并记录为产物版本。"
            messageContent={visibleContent}
            messageId={message.id}
            onApplyDiff={hasDiffArtifact ? () => onApplyDiff?.(message) : undefined}
            onQuote={onQuote}
            showApplyDiff={hasDiffArtifact}
            showCopy={false}
            showRegenerate={message.role === "assistant"}
            statusClassName="font-medium text-muted-foreground"
            workspaceId={message.workspaceId}
          />
        </div>

        {message.threadReplyCount > 0 && onReply ? (
          <button
            className="mt-1 rounded-full px-2.5 py-1 text-xs font-semibold text-[#007aff] transition hover:bg-[#007aff]/10"
            onClick={() => onReply?.(message)}
            type="button"
          >
            查看 {message.threadReplyCount} 条回复
          </button>
        ) : null}
      </div>
    </article>
  );
}

const actionClassName =
  "rounded-full px-2 py-1 font-medium text-muted-foreground transition-colors hover:bg-black/[0.06] hover:text-foreground";

function formatRuntimeArtifactStatus(status: RuntimeArtifactStatus): string {
  switch (status.status) {
    case "created":
      return "Markdown 文件已生成：" + status.title;
    case "failed":
      return "Markdown 文件生成失败：" + status.title;
    case "creating":
      return "正在生成 Markdown 文件：" + status.title;
  }
}

function runtimeArtifactStatusClass(status: RuntimeArtifactStatus["status"]): string {
  switch (status) {
    case "created":
      return "bg-emerald-50 text-emerald-700";
    case "failed":
      return "bg-red-50 text-red-700";
    case "creating":
      return "bg-sky-50 text-sky-700";
  }
}

function formatMessageTime(value: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
