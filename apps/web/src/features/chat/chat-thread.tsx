import {
  sanitizeAssistantVisibleContent,
  type Artifact,
  type Message,
  type OrchestratorStatusEventPayload,
  type RuntimeArtifactStatus
} from "@agenthub/contracts";

import { Avatar } from "../../components/ui/avatar";
import { DeployStatusCard } from "../artifacts/deploy-status-card";
import type { DeployCommandResult } from "./deploy-command";
import { ChatMessage } from "./chat-message";
import { MarkdownContent } from "./markdown-content";

type ChatThreadProps = {
  artifactsByMessageId: Record<string, Artifact[]>;
  artifactStatusesByMessageId?: Record<string, RuntimeArtifactStatus[]>;
  connectionState: "connecting" | "error" | "idle" | "open";
  deployments: DeployCommandResult[];
  isLoading?: boolean;
  isPinningMessageId: string | null;
  liveAssistantMessage: {
    content: string;
    id: string;
    isComplete?: boolean;
  } | null;
  liveStatus?: OrchestratorStatusEventPayload | null;
  messages: Message[];
  onApplyDiffMessage?: (message: Message) => Promise<string | void> | string | void;
  onTogglePinMessage: (message: Message) => Promise<void>;
  onQuoteMessage?: (quoted: string) => void;
  onReplyMessage?: (message: Message) => void;
  resolveAuthorLabel?: (message: Message) => string | undefined;
  suppressEmptyState?: boolean;
};

export function ChatThread({
  artifactsByMessageId,
  artifactStatusesByMessageId = {},
  connectionState,
  deployments,
  isLoading = false,
  isPinningMessageId,
  liveAssistantMessage,
  liveStatus = null,
  messages,
  onApplyDiffMessage,
  onTogglePinMessage,
  onQuoteMessage,
  onReplyMessage,
  resolveAuthorLabel,
  suppressEmptyState = false
}: ChatThreadProps) {
  const hasPersistedLiveMessage =
    liveAssistantMessage &&
    messages.some((message) => message.id === liveAssistantMessage.id);
  const liveAssistantVisibleContent = liveAssistantMessage
    ? sanitizeAssistantVisibleContent(liveAssistantMessage.content)
    : "";

  return (
    <section className="grid content-start gap-1">
      <div className="justify-self-center rounded-full px-3 py-0.5 text-[11px] font-medium text-muted-foreground/70">
        流状态：{formatConnectionState(connectionState)}
      </div>
      {deployments.map((entry) => (
        <DeployStatusCard
          artifact={entry.artifact}
          deployment={entry.deployment}
          key={entry.deployment.id}
          target={entry.target}
        />
      ))}
      {isLoading && messages.length === 0 && deployments.length === 0 && !liveAssistantMessage ? (
        <div className="justify-self-center rounded-full bg-black/[0.04] px-4 py-2 text-sm text-muted-foreground">
          正在加载会话消息...
        </div>
      ) : null}
      {!suppressEmptyState &&
      !isLoading &&
      messages.length === 0 &&
      deployments.length === 0 &&
      !liveAssistantMessage ? (
        <div className="justify-self-center py-10 text-center text-sm leading-7 text-muted-foreground">
          当前会话还没有消息。发送第一条消息，开始和 Agent 一起推进网页或 Workflow。
        </div>
      ) : null}
      {messages.map((message, index) => {
        const previous = messages[index - 1] ?? null;
        const showDateDivider =
          !previous || formatDateKey(previous.createdAt) !== formatDateKey(message.createdAt);
        const authorLabel = resolveAuthorLabel?.(message) ?? message.author?.displayName;
        const previousAuthorLabel = previous
          ? resolveAuthorLabel?.(previous) ?? previous.author?.displayName
          : null;
        const isGroupedWithPrevious =
          Boolean(previous) &&
          previous?.role === message.role &&
          previousAuthorLabel === authorLabel &&
          !showDateDivider;

        return (
          <div className="grid gap-1" key={message.id}>
            {showDateDivider ? (
              <div className="mt-3 justify-self-center rounded-full px-3 py-0.5 text-[11px] font-medium text-muted-foreground/80">
                {formatDateLabel(message.createdAt)}
              </div>
            ) : null}
            <ChatMessage
              authorLabel={authorLabel}
              artifacts={artifactsByMessageId[message.id] ?? []}
              artifactStatuses={artifactStatusesByMessageId[message.id] ?? []}
              isGroupedWithPrevious={isGroupedWithPrevious}
              isPinDisabled={isPinningMessageId !== null && isPinningMessageId !== message.id}
              isPinPending={isPinningMessageId === message.id}
              message={message}
              onApplyDiff={onApplyDiffMessage}
              onPin={() => {
                void onTogglePinMessage(message);
              }}
              onQuote={onQuoteMessage}
              onReply={onReplyMessage}
            />
          </div>
        );
      })}
      {liveAssistantMessage && !hasPersistedLiveMessage ? (
        <article className="mt-3 flex w-full gap-2.5">
          <span className="shrink-0">
            <Avatar name="AI" size="sm" />
          </span>
          <div className="flex min-w-0 max-w-[76%] flex-col items-start">
            <div className="mb-1 px-1 text-[13px] font-semibold text-foreground">AI 同事</div>
            <div className="rounded-[1.15rem] bg-white px-3.5 py-2.5 text-[15px] leading-relaxed shadow-card">
              {liveAssistantMessage.content.trim().length > 0 ? (
                <MarkdownContent content={liveAssistantVisibleContent} />
              ) : (
                <TypingIndicator />
              )}
              {liveAssistantMessage.content.trim().length === 0 && liveStatus ? (
                <div
                  aria-live="polite"
                  className="mt-2 grid gap-0.5 text-xs font-medium text-muted-foreground"
                >
                  {liveStatus.activeAgentName ? (
                    <span>当前同事：{liveStatus.activeAgentName}</span>
                  ) : null}
                  <span>
                    进度：{Math.min(liveStatus.successfulAgentCount, liveStatus.totalAgentCount)}
                    /{liveStatus.totalAgentCount}
                  </span>
                </div>
              ) : null}
            </div>
            <div className="mt-1 px-1 text-[11px] text-muted-foreground/80">
              {liveAssistantMessage.content.trim().length > 0
                ? liveAssistantMessage.isComplete
                  ? "正在同步持久化结果"
                  : "正在通过实时流返回内容"
                : formatLiveStatusSummary(liveStatus) ?? "AI 同事正在处理你的消息"}
            </div>
          </div>
        </article>
      ) : null}
    </section>
  );
}

function TypingIndicator() {
  return (
    <span className="inline-flex items-center gap-1 py-1">
      <span className="sr-only">AI 同事正在输入</span>
      {[0, 1, 2].map((index) => (
        <span
          aria-hidden="true"
          className="h-2 w-2 animate-pulse rounded-full bg-slate-400"
          key={index}
          style={{
            animationDelay: `${index * 120}ms`
          }}
        />
      ))}
    </span>
  );
}

function formatDateKey(value: Date): string {
  return new Date(value).toISOString().slice(0, 10);
}

function formatDateLabel(value: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    day: "numeric",
    month: "long",
    weekday: "short"
  }).format(new Date(value));
}

function formatConnectionState(
  state: ChatThreadProps["connectionState"]
): "空闲" | "连接中" | "连接失败" | "已连接" {
  switch (state) {
    case "connecting":
      return "连接中";
    case "error":
      return "连接失败";
    case "open":
      return "已连接";
    case "idle":
      return "空闲";
  }
}

function formatLiveStatusSummary(
  status: OrchestratorStatusEventPayload | null
): string | null {
  if (!status) {
    return null;
  }

  if (status.summary) {
    return status.summary
      .replace(/\bORCHESTRATOR\s+[A-Z_]+\s*/gi, "")
      .trim();
  }

  if (status.activeAgentName) {
    return `${status.activeAgentName}正在处理你的消息`;
  }

  return "AI 同事正在处理你的消息";
}
