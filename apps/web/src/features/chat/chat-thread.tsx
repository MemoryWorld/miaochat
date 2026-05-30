import type {
  Artifact,
  Message,
  OrchestratorStatusEventPayload
} from "@agenthub/contracts";

import { DeployStatusCard } from "../artifacts/deploy-status-card";
import type { DeployCommandResult } from "./deploy-command";
import { ChatMessage } from "./chat-message";
import { SystemStatusCard } from "./system-status-card";

type ChatThreadProps = {
  artifactsByMessageId: Record<string, Artifact[]>;
  connectionState: "connecting" | "error" | "idle" | "open";
  deployments: DeployCommandResult[];
  isPinningMessageId: string | null;
  liveAssistantMessage: {
    content: string;
    id: string;
  } | null;
  messages: Message[];
  onPinMessage: (messageId: string) => Promise<void>;
  resolveAuthorLabel?: (message: Message) => string | undefined;
  statusEvents: OrchestratorStatusEventPayload[];
};

export function ChatThread({
  artifactsByMessageId,
  connectionState,
  deployments,
  isPinningMessageId,
  liveAssistantMessage,
  messages,
  onPinMessage,
  resolveAuthorLabel,
  statusEvents
}: ChatThreadProps) {
  const hasPersistedLiveMessage =
    liveAssistantMessage &&
    messages.some((message) => message.id === liveAssistantMessage.id);

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
      {statusEvents.map((event, index) => (
        <SystemStatusCard
          event={event}
          key={`${event.label}:${event.successfulAgentCount}:${event.failures.length}:${index}`}
        />
      ))}
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
      {messages.map((message) => (
        <ChatMessage
          authorLabel={resolveAuthorLabel?.(message)}
          artifacts={artifactsByMessageId[message.id] ?? []}
          isPinDisabled={isPinningMessageId !== null && isPinningMessageId !== message.id}
          isPinPending={isPinningMessageId === message.id}
          key={message.id}
          message={message}
          onPin={() => {
            void onPinMessage(message.id);
          }}
        />
      ))}
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
          <div style={{ lineHeight: 1.7 }}>{liveAssistantMessage.content}</div>
          <div
            style={{
              color: "#175cd3",
              fontSize: "0.78rem",
              marginTop: "0.5rem"
            }}
          >
            正在通过实时流返回内容
          </div>
        </article>
      ) : null}
    </section>
  );
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
