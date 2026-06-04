"use client";

import {
  sanitizeAssistantVisibleContent,
  type Artifact,
  type Message,
  type RuntimeArtifactStatus
} from "@agenthub/contracts";

import { ArtifactCard } from "../artifacts/artifact-card";
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

  return (
    <article
      data-message-id={message.id}
      data-message-role={message.role}
      id={`message-${message.id}`}
      style={{
        background: isUser ? "rgba(16, 24, 40, 0.92)" : "rgba(243, 244, 246, 0.95)",
        borderRadius: "20px",
        color: isUser ? "#fff" : "#101828",
        justifySelf: isUser ? "end" : "start",
        marginTop: isGroupedWithPrevious ? "-0.35rem" : 0,
        maxWidth: "80%",
        padding: "0.95rem 1rem"
      }}
    >
      {!isGroupedWithPrevious ? (
        <div className="mb-2 flex items-center gap-2">
          <div
            className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
              isUser ? "bg-white text-slate-950" : "bg-slate-950 text-white"
            }`}
          >
            {(authorLabel ?? message.role).slice(0, 1)}
          </div>
          <div>
            <div className="text-xs font-bold opacity-85">{authorLabel ?? message.role}</div>
            <time className="text-[11px] opacity-65" dateTime={new Date(message.createdAt).toISOString()}>
              {formatMessageTime(message.createdAt)}
            </time>
          </div>
        </div>
      ) : null}
      <div style={{ lineHeight: 1.7 }}>{visibleContent}</div>
      {artifactStatuses.length > 0 ? (
        <div
          aria-label={`Markdown file status for message ${message.id}`}
          aria-live="polite"
          data-message-artifact-statuses
          style={{
            display: "grid",
            gap: "0.4rem",
            marginTop: "0.65rem"
          }}
        >
          {artifactStatuses.map((status) => (
            <div
              key={`${status.type}:${status.title}`}
              style={{
                background: runtimeArtifactStatusBackground(status.status),
                border: `1px solid ${runtimeArtifactStatusBorder(status.status)}`,
                borderRadius: "8px",
                color: runtimeArtifactStatusTextColor(status.status),
                fontSize: "0.78rem",
                fontWeight: 700,
                lineHeight: 1.6,
                padding: "0.45rem 0.55rem"
              }}
            >
              <div>{formatRuntimeArtifactStatus(status)}</div>
              {status.status === "failed" && status.error ? (
                <div style={{ fontWeight: 600, opacity: 0.82 }}>{status.error}</div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {artifacts.length > 0 ? (
        <div
          aria-label={`Artifacts attached to message ${message.id}`}
          data-message-artifacts
          style={{
            display: "grid",
            gap: "0.55rem",
            marginTop: "0.7rem"
          }}
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
      <PinMessageAction
        disabled={isPinDisabled}
        isPending={isPinPending}
        isPinned={message.isPinned}
        onPin={onPin}
        tone={isUser ? "dark" : "light"}
      />
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <button
          className={isUser ? darkActionClassName : lightActionClassName}
          onClick={() => {
            void navigator.clipboard?.writeText(visibleContent);
          }}
          type="button"
        >
          复制
        </button>
        <button
          className={isUser ? darkActionClassName : lightActionClassName}
          onClick={() => onReply?.(message)}
          type="button"
        >
          回复
        </button>
        <MessageActionsMenu
          buttonClassName={isUser ? darkActionClassName : lightActionClassName}
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
          statusClassName={isUser ? "font-semibold text-white/80" : "font-semibold text-slate-500"}
          workspaceId={message.workspaceId}
        />
      </div>
      {message.threadReplyCount > 0 && onReply ? (
        <button
          className={isUser ? darkThreadClassName : lightThreadClassName}
          onClick={() => onReply?.(message)}
          type="button"
        >
          查看 {message.threadReplyCount} 条回复
        </button>
      ) : null}
    </article>
  );
}

const darkActionClassName =
  "rounded-full border border-white/15 bg-white/10 px-2.5 py-1 font-semibold text-white transition hover:bg-white/20";
const lightActionClassName =
  "rounded-full border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-600 transition hover:bg-slate-50";
const darkThreadClassName =
  "mt-3 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white transition hover:bg-white/20";
const lightThreadClassName =
  "mt-3 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50";

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

function runtimeArtifactStatusBackground(
  status: RuntimeArtifactStatus["status"]
): string {
  switch (status) {
    case "created":
      return "rgba(236, 253, 243, 0.92)";
    case "failed":
      return "rgba(254, 243, 242, 0.92)";
    case "creating":
      return "rgba(239, 248, 255, 0.92)";
  }
}

function runtimeArtifactStatusBorder(status: RuntimeArtifactStatus["status"]): string {
  switch (status) {
    case "created":
      return "rgba(18, 183, 106, 0.3)";
    case "failed":
      return "rgba(240, 68, 56, 0.32)";
    case "creating":
      return "rgba(46, 144, 250, 0.3)";
  }
}

function runtimeArtifactStatusTextColor(
  status: RuntimeArtifactStatus["status"]
): string {
  switch (status) {
    case "created":
      return "#027a48";
    case "failed":
      return "#b42318";
    case "creating":
      return "#175cd3";
  }
}

function formatMessageTime(value: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
