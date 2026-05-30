"use client";

import type { Artifact, Message } from "@agenthub/contracts";

import { ArtifactCard } from "../artifacts/artifact-card";
import { PinMessageAction } from "./pin-message-action";

type ChatMessageProps = {
  authorLabel?: string;
  artifacts: Artifact[];
  isPinPending: boolean;
  isPinDisabled: boolean;
  message: Message;
  onPin: () => void;
};

export function ChatMessage({
  authorLabel,
  artifacts,
  isPinDisabled,
  isPinPending,
  message,
  onPin
}: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <article
      data-message-id={message.id}
      data-message-role={message.role}
      style={{
        background: isUser ? "rgba(16, 24, 40, 0.92)" : "rgba(243, 244, 246, 0.95)",
        borderRadius: "20px",
        color: isUser ? "#fff" : "#101828",
        justifySelf: isUser ? "end" : "start",
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
        {authorLabel ?? message.role}
      </div>
      <div style={{ lineHeight: 1.7 }}>{message.content}</div>
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
            <ArtifactCard artifact={artifact} key={artifact.id} />
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
    </article>
  );
}
