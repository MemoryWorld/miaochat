import { describe, expect, it } from "vitest";

import {
  assembleConversationContext,
  assemblePinnedContext
} from "../src/context/context-assembler.js";

describe("assemblePinnedContext", () => {
  it("keeps only pinned messages and preserves their replay order", () => {
    const context = assemblePinnedContext([
      {
        content: "ignore this",
        conversationId: "conv_1",
        createdAt: new Date("2026-05-21T12:00:00.000Z"),
        id: "msg_unpinned",
        isPinned: false,
        role: "user",
        sourceAgentId: null,
        workspaceId: "workspace_1"
      },
      {
        content: "remember this note",
        conversationId: "conv_1",
        createdAt: new Date("2026-05-21T12:01:00.000Z"),
        id: "msg_pinned_1",
        isPinned: true,
        role: "user",
        sourceAgentId: null,
        workspaceId: "workspace_1"
      },
      {
        content: "and this follow-up",
        conversationId: "conv_1",
        createdAt: new Date("2026-05-21T12:02:00.000Z"),
        id: "msg_pinned_2",
        isPinned: true,
        role: "assistant",
        sourceAgentId: "agent_mock",
        workspaceId: "workspace_1"
      }
    ]);

    expect(context.pinnedMessages).toEqual([
      {
        content: "remember this note",
        id: "msg_pinned_1",
        role: "user"
      },
      {
        content: "and this follow-up",
        id: "msg_pinned_2",
        role: "assistant"
      }
    ]);
  });

  it("adds bounded recent messages while keeping pinned messages separate", () => {
    const context = assembleConversationContext({
      maxChars: 40,
      pinnedMessages: [
        {
          content: "important",
          conversationId: "conv_1",
          createdAt: new Date("2026-05-21T12:02:00.000Z"),
          id: "msg_pin",
          isPinned: true,
          role: "user",
          sourceAgentId: null,
          workspaceId: "workspace_1"
        }
      ],
      recentMessages: [
        {
          content: "older history that should be skipped by budget",
          conversationId: "conv_1",
          createdAt: new Date("2026-05-21T12:00:00.000Z"),
          id: "msg_old",
          isPinned: false,
          role: "user",
          sourceAgentId: null,
          workspaceId: "workspace_1"
        },
        {
          content: "important",
          conversationId: "conv_1",
          createdAt: new Date("2026-05-21T12:01:00.000Z"),
          id: "msg_pin",
          isPinned: true,
          role: "user",
          sourceAgentId: null,
          workspaceId: "workspace_1"
        },
        {
          content: "latest context",
          conversationId: "conv_1",
          createdAt: new Date("2026-05-21T12:03:00.000Z"),
          id: "msg_recent",
          isPinned: false,
          role: "assistant",
          sourceAgentId: "agent_mock",
          workspaceId: "workspace_1"
        }
      ]
    });

    expect(context.pinnedMessages).toEqual([
      {
        content: "important",
        id: "msg_pin",
        role: "user"
      }
    ]);
    expect(context.recentMessages).toEqual([
      {
        content: "latest context",
        id: "msg_recent",
        role: "assistant"
      }
    ]);
  });
});
