import type { Message } from "@agenthub/contracts";

import { PinMessageAction } from "./pin-message-action";

type ChatThreadProps = {
  connectionState: "connecting" | "error" | "idle" | "open";
  isPinningMessageId: string | null;
  liveAssistantMessage: {
    content: string;
    id: string;
  } | null;
  messages: Message[];
  onPinMessage: (messageId: string) => Promise<void>;
};

export function ChatThread({
  connectionState,
  isPinningMessageId,
  liveAssistantMessage,
  messages,
  onPinMessage
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
        Stream state: {connectionState}
      </div>
      {messages.length === 0 && !liveAssistantMessage ? (
        <div
          style={{
            border: "1px dashed rgba(15, 23, 42, 0.16)",
            borderRadius: "20px",
            color: "#475467",
            padding: "1rem 1.1rem"
          }}
        >
          No messages yet. Send the first prompt to start the mock slice.
        </div>
      ) : null}
      {messages.map((message) => (
        <article
          key={message.id}
          style={{
            background:
              message.role === "user"
                ? "rgba(16, 24, 40, 0.92)"
                : "rgba(243, 244, 246, 0.95)",
            borderRadius: "20px",
            color: message.role === "user" ? "#fff" : "#101828",
            justifySelf: message.role === "user" ? "end" : "start",
            maxWidth: "80%",
            padding: "0.95rem 1rem"
          }}
        >
          <div
            style={{
              fontSize: "0.78rem",
              fontWeight: 700,
              marginBottom: "0.35rem",
              opacity: 0.8,
              textTransform: "uppercase"
            }}
          >
            {message.role}
          </div>
          <div style={{ lineHeight: 1.7 }}>{message.content}</div>
          <PinMessageAction
            disabled={isPinningMessageId !== null && isPinningMessageId !== message.id}
            isPending={isPinningMessageId === message.id}
            isPinned={message.isPinned}
            onPin={() => {
              void onPinMessage(message.id);
            }}
            tone={message.role === "user" ? "dark" : "light"}
          />
        </article>
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
            assistant
          </div>
          <div style={{ lineHeight: 1.7 }}>{liveAssistantMessage.content}</div>
          <div
            style={{
              color: "#175cd3",
              fontSize: "0.78rem",
              marginTop: "0.5rem"
            }}
          >
            Streaming via SSE
          </div>
        </article>
      ) : null}
    </section>
  );
}
