"use client";

import type { Artifact, Message } from "@agenthub/contracts";

import { ArtifactCard } from "../artifacts/artifact-card";
import { PinMessageAction } from "./pin-message-action";

type ChatMessageProps = {
  authorLabel?: string;
  artifacts: Artifact[];
  isGroupedWithPrevious?: boolean;
  isPinPending: boolean;
  isPinDisabled: boolean;
  message: Message;
  onPin: () => void;
  onReply?: (message: Message) => void;
  onToggleReaction?: (message: Message, emoji: string) => Promise<void>;
};

export function ChatMessage({
  authorLabel,
  artifacts,
  isGroupedWithPrevious = false,
  isPinDisabled,
  isPinPending,
  message,
  onPin,
  onReply,
  onToggleReaction
}: ChatMessageProps) {
  const isUser = message.role === "user";

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
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <button
          className={isUser ? darkActionClassName : lightActionClassName}
          onClick={() => {
            void navigator.clipboard?.writeText(message.content);
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
        {["👍", "✅", "👀"].map((entry) => (
          <button
            aria-pressed={hasCurrentUserReaction(message, entry)}
            className={isUser ? darkActionClassName : lightActionClassName}
            key={entry}
            onClick={() => {
              void onToggleReaction?.(message, entry);
            }}
            type="button"
          >
            {entry}
            {renderReactionCount(message, entry)}
          </button>
        ))}
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

function hasCurrentUserReaction(message: Message, emoji: string): boolean {
  return Boolean(
    (message.reactions ?? []).find(
      (reaction) => reaction.emoji === emoji && reaction.reactedByCurrentUser
    )
  );
}

function renderReactionCount(message: Message, emoji: string): string {
  const reaction = (message.reactions ?? []).find((entry) => entry.emoji === emoji);

  return reaction && reaction.count > 0 ? ` ${reaction.count}` : "";
}

function formatMessageTime(value: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
