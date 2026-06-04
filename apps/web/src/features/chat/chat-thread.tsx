import {
  sanitizeAssistantVisibleContent,
  type Artifact,
  type Message,
  type RuntimeArtifactStatus
} from "@agenthub/contracts";

import { DeployStatusCard } from "../artifacts/deploy-status-card";
import type { DeployCommandResult } from "./deploy-command";
import { ChatMessage } from "./chat-message";

type ChatThreadProps = {
  artifactsByMessageId: Record<string, Artifact[]>;
  artifactStatusesByMessageId?: Record<string, RuntimeArtifactStatus[]>;
  connectionState: "connecting" | "error" | "idle" | "open";
  deployments: DeployCommandResult[];
  isPinningMessageId: string | null;
  liveAssistantMessage: {
    content: string;
    id: string;
  } | null;
  messages: Message[];
  onApplyDiffMessage?: (message: Message) => Promise<string | void> | string | void;
  onPinMessage: (messageId: string) => Promise<void>;
  onQuoteMessage?: (quoted: string) => void;
  onReplyMessage?: (message: Message) => void;
  resolveAuthorLabel?: (message: Message) => string | undefined;
};

export function ChatThread({
  artifactsByMessageId,
  artifactStatusesByMessageId = {},
  connectionState,
  deployments,
  isPinningMessageId,
  liveAssistantMessage,
  messages,
  onApplyDiffMessage,
  onPinMessage,
  onQuoteMessage,
  onReplyMessage,
  resolveAuthorLabel
}: ChatThreadProps) {
  const hasPersistedLiveMessage =
    liveAssistantMessage &&
    messages.some((message) => message.id === liveAssistantMessage.id);
  const liveAssistantVisibleContent = liveAssistantMessage
    ? sanitizeAssistantVisibleContent(liveAssistantMessage.content)
    : "";

  return (
    <section
      style={{
        display: "grid",
        gap: "0.9rem"
      }}
    >
      <div
        style={{
          color: "#475467",
          fontSize: "0.92rem"
        }}
      >
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
      {messages.length === 0 && deployments.length === 0 && !liveAssistantMessage ? (
        <div
          style={{
            border: "1px dashed rgba(15, 23, 42, 0.16)",
            borderRadius: "20px",
            color: "#475467",
            padding: "1rem 1.1rem"
          }}
        >
          当前频道还没有消息。发送第一条消息，开始和 AI 同事一起推进工作。
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
          <div className="grid gap-2" key={message.id}>
            {showDateDivider ? (
              <div className="flex items-center gap-3 text-xs font-semibold text-slate-400">
                <span className="h-px flex-1 bg-slate-200" />
                {formatDateLabel(message.createdAt)}
                <span className="h-px flex-1 bg-slate-200" />
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
                void onPinMessage(message.id);
              }}
              onQuote={onQuoteMessage}
              onReply={onReplyMessage}
            />
          </div>
        );
      })}
      {liveAssistantMessage && !hasPersistedLiveMessage ? (
        <article
          style={{
            background: "rgba(217, 239, 255, 0.92)",
            border: "1px solid rgba(11, 110, 255, 0.12)",
            borderRadius: "20px",
            color: "#0b2545",
            justifySelf: "start",
            maxWidth: "80%",
            padding: "0.95rem 1rem"
          }}
        >
          <div
            style={{
              fontSize: "0.78rem",
              fontWeight: 700,
              marginBottom: "0.35rem",
              textTransform: "uppercase"
            }}
          >
            AI 同事
          </div>
          <div style={{ lineHeight: 1.7 }}>
            {liveAssistantMessage.content.trim().length > 0 ? (
              liveAssistantVisibleContent
            ) : (
              <TypingIndicator />
            )}
          </div>
          <div
            style={{
              color: "#175cd3",
              fontSize: "0.78rem",
              marginTop: "0.5rem"
            }}
          >
            {liveAssistantMessage.content.trim().length > 0
              ? "正在通过实时流返回内容"
              : "AI 同事正在处理你的消息"}
          </div>
        </article>
      ) : null}
    </section>
  );
}

function TypingIndicator() {
  return (
    <span className="inline-flex items-center gap-1 text-sm font-semibold text-slate-600">
      <span className="sr-only">AI 同事正在输入</span>
      {[0, 1, 2].map((index) => (
        <span
          aria-hidden="true"
          className="h-2 w-2 animate-pulse rounded-full bg-slate-500"
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
