// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ChatMessage } from "./chat-message";

describe("ChatMessage", () => {
  it("keeps collaboration actions but does not render consumer reaction buttons", () => {
    render(
      <ChatMessage
        artifacts={[]}
        isPinDisabled={false}
        isPinPending={false}
        message={{
          content: "先拆解问题，再给出方案。",
          conversationId: "conv_1",
          createdAt: new Date("2026-05-30T10:00:00.000Z"),
          author: null,
          authorUserId: null,
          id: "msg_1",
          isPinned: false,
          mentionedAgentIds: [],
          mentionedUserIds: [],
          ownerUserId: "user_1",
          reactions: [
            {
              count: 1,
              emoji: "👍",
              reactedByCurrentUser: true
            }
          ],
          role: "assistant",
          sourceAgentId: "agent_1",
          threadLastReplyAt: null,
          threadParentMessageId: null,
          threadReplyCount: 0,
          workspaceId: "workspace_1"
        }}
        onPin={vi.fn()}
        onReply={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "复制" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "回复" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /👍/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /✅/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /👀/ })).not.toBeInTheDocument();
  });
});
