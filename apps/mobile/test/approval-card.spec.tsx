import { act, create } from "react-test-renderer";
import type { ReactElement } from "react";
import { Image, Pressable, Text } from "react-native";
import { describe, expect, it, vi } from "vitest";

import type { ApprovalRequest, Artifact, Conversation, Message } from "@agenthub/contracts";

import { ApprovalCard } from "../src/components/approval-card.js";
import { ConversationListScreen } from "../src/screens/conversation-list.js";
import { ConversationThreadScreen } from "../src/screens/conversation-thread.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("mobile shell components", () => {
  it("surfaces approve and reject actions through the approval card callbacks", () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();
    const renderer = renderWithAct(
      <ApprovalCard
        description="发布预览部署到当前工作区。"
        onApprove={onApprove}
        onReject={onReject}
        title="部署审批"
      />
    );

    const buttons = renderer.root.findAllByType(Pressable);
    act(() => {
      buttons[0]?.props.onPress();
      buttons[1]?.props.onPress();
    });

    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onReject).toHaveBeenCalledTimes(1);
    expect(renderedText(renderer)).toContain("待审批");
  });

  it("renders browseable conversations and reports selection", () => {
    const onSelectConversation = vi.fn();
    const renderer = renderWithAct(
      <ConversationListScreen
        conversations={[
          buildConversation({
            id: "conv_mobile_1",
            isPinned: true,
            mode: "group",
            title: "发布协作"
          }),
          buildConversation({
            id: "conv_mobile_2",
            mode: "direct",
            title: "设计复核"
          })
        ]}
        onRefresh={() => undefined}
        onSelectConversation={onSelectConversation}
        selectedConversationId="conv_mobile_1"
      />
    );

    expect(renderedText(renderer)).toContain("发布协作");
    expect(renderedText(renderer)).toContain("置顶");

    const conversationButtons = renderer.root
      .findAllByType(Pressable)
      .filter((button) => button.props.children);

    act(() => {
      conversationButtons[1]?.props.onPress();
    });

    expect(onSelectConversation).toHaveBeenCalledWith("conv_mobile_1");
  });

  it("renders approval cards, messages, and image artifact previews inside a thread", () => {
    const onApprove = vi.fn();
    const renderer = renderWithAct(
      <ConversationThreadScreen
        approvals={[
          buildApproval({
            conversationId: "conv_mobile_1",
            id: "approval_mobile_1",
            title: "计划审批"
          })
        ]}
        artifactsByMessageId={{
          message_mobile_1: [
            buildArtifact({
              id: "artifact_mobile_1",
              kind: "image",
              messageId: "message_mobile_1",
              previewUrl: "https://files.example/preview.png",
              title: "预览截图"
            })
          ]
        }}
        conversation={buildConversation({
          id: "conv_mobile_1",
          mode: "group",
          title: "发布协作"
        })}
        isLoading={false}
        messages={[
          buildMessage({
            content: "请确认计划后继续执行。",
            id: "message_mobile_1"
          })
        ]}
        onApprove={onApprove}
        onReject={() => undefined}
      />
    );

    expect(renderedText(renderer)).toContain("计划审批");
    expect(renderedText(renderer)).toContain("请确认计划后继续执行。");
    expect(renderer.root.findByType(Image).props.source).toEqual({
      uri: "https://files.example/preview.png"
    });

    const approveButton = renderer.root.findAllByType(Pressable)[0];
    act(() => {
      approveButton?.props.onPress();
    });

    expect(onApprove).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "approval_mobile_1"
      })
    );
  });
});

function renderWithAct(node: ReactElement): ReturnType<typeof create> {
  let renderer: ReturnType<typeof create> | null = null;

  act(() => {
    renderer = create(node);
  });

  if (!renderer) {
    throw new Error("Renderer did not initialize.");
  }

  return renderer;
}

function renderedText(renderer: ReturnType<typeof create>): string {
  return renderer.root.findAllByType(Text).map((node) => node.props.children).flat(4).join(" ");
}

function buildConversation(input: Partial<Conversation>): Conversation {
  return {
    archivedAt: null,
    id: input.id ?? "conv_mobile",
    isPinned: input.isPinned ?? false,
    mode: input.mode ?? "direct",
    ownerUserId: "user_mobile",
    participants: [
      {
        agentId: "agent_mobile",
        agentName: "移动端助手"
      }
    ],
    pinnedMessageIds: [],
    title: input.title ?? "移动端会话",
    updatedAt: new Date("2026-06-05T00:00:00.000Z"),
    workspaceId: "workspace_mobile"
  };
}

function buildApproval(input: Partial<ApprovalRequest>): ApprovalRequest {
  return {
    conversationId: input.conversationId ?? "conv_mobile",
    createdAt: new Date("2026-06-05T00:00:00.000Z"),
    id: input.id ?? "approval_mobile",
    kind: "coding_plan",
    note: null,
    planVersion: 1,
    requesterTeammateId: "tech_lead",
    requesterTeammateName: "技术负责人",
    respondedAt: null,
    responseNote: null,
    status: "pending",
    summary: "技术负责人已经提交计划，等待移动端确认。",
    targetUserId: "user_mobile",
    title: input.title ?? "计划审批",
    updatedAt: new Date("2026-06-05T00:00:00.000Z"),
    workflowId: "workflow_mobile",
    workspaceId: "workspace_mobile"
  };
}

function buildMessage(input: Partial<Message>): Message {
  return {
    author: {
      avatarUrl: null,
      displayName: "技术负责人",
      kind: "ai",
      teammateId: "tech_lead"
    },
    authorUserId: null,
    content: input.content ?? "移动端消息",
    conversationId: "conv_mobile_1",
    createdAt: new Date("2026-06-05T00:00:00.000Z"),
    id: input.id ?? "message_mobile",
    isPinned: false,
    mentionedAgentIds: [],
    mentionedUserIds: [],
    ownerUserId: "user_mobile",
    reactions: [],
    role: "assistant",
    sourceAgentId: "agent_mobile",
    threadLastReplyAt: null,
    threadParentMessageId: null,
    threadReplyCount: 0,
    workspaceId: "workspace_mobile"
  };
}

function buildArtifact(input: Partial<Artifact>): Artifact {
  return {
    createdAt: new Date("2026-06-05T00:00:00.000Z"),
    id: input.id ?? "artifact_mobile",
    kind: input.kind ?? "image",
    messageId: input.messageId ?? "message_mobile",
    mimeType: "image/png",
    previewUrl: input.previewUrl ?? "https://files.example/preview.png",
    storageKey: null,
    title: input.title ?? "预览截图",
    workspaceId: "workspace_mobile"
  };
}
