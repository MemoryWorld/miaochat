"use client";

import { useState } from "react";

type ChatComposerProps = {
  disabled?: boolean;
  onSend: (content: string) => Promise<void>;
};

export function ChatComposer({ disabled = false, onSend }: ChatComposerProps) {
  const [content, setContent] = useState("");

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();

        const trimmed = content.trim();

        if (!trimmed || disabled) {
          return;
        }

        await onSend(trimmed);
        setContent("");
      }}
      style={{
        borderTop: "1px solid rgba(15, 23, 42, 0.08)",
        display: "grid",
        gap: "0.75rem",
        marginTop: "1rem",
        paddingTop: "1rem"
      }}
    >
      <label
        htmlFor="chat-composer-input"
        style={{
          color: "#344054",
          display: "grid",
          fontSize: "0.95rem",
          fontWeight: 600,
          gap: "0.4rem"
        }}
      >
        Message
        <textarea
          id="chat-composer-input"
          disabled={disabled}
          onChange={(event) => {
            setContent(event.target.value);
          }}
          placeholder="Ask the mock builder to work on the next step."
          rows={3}
          value={content}
          style={{
            border: "1px solid rgba(15, 23, 42, 0.12)",
            borderRadius: "16px",
            font: "inherit",
            padding: "0.9rem 1rem",
            resize: "vertical"
          }}
        />
      </label>
      <div>
        <button
          disabled={disabled || content.trim().length === 0}
          style={buttonStyle}
          type="submit"
        >
          Send message
        </button>
      </div>
    </form>
  );
}

const buttonStyle = {
  background: "#101828",
  border: 0,
  borderRadius: "999px",
  color: "#fff",
  cursor: "pointer",
  font: "inherit",
  fontWeight: 600,
  padding: "0.75rem 1.1rem"
} as const;
