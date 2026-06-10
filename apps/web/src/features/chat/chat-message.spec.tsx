// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Message } from "@agenthub/contracts";
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
    expect(screen.getByRole("button", { name: "引用" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新生成" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /👍/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /✅/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /👀/ })).not.toBeInTheDocument();
  });

  it("lets users unpin a pinned message", () => {
    const onPin = vi.fn();

    render(
      <ChatMessage
        artifacts={[]}
        isPinDisabled={false}
        isPinPending={false}
        message={makeMessage({
          isPinned: true
        })}
        onPin={onPin}
        onReply={vi.fn()}
      />
    );

    const unpinButton = screen.getByRole("button", { name: "取消置顶" });
    fireEvent.click(unpinButton);

    expect(onPin).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Pinned")).not.toBeInTheDocument();
  });

  it("does not render internal collaboration control JSON from existing assistant messages", () => {
    render(
      <ChatMessage
        artifacts={[]}
        isPinDisabled={false}
        isPinPending={false}
        message={makeMessage({
          content: [
            "我会先整理方案，并把下一步拆清楚。",
            "```json",
            JSON.stringify({
              acceptanceCriteria: ["完成测试"],
              constraints: ["保持用户可配置"],
              goal: "安排下一位同事继续",
              targetAgentId: "agent_builder",
              targetRoleKey: "builder",
              type: "handoff_request"
            }),
            "```"
          ].join("\n")
        })}
        onPin={vi.fn()}
        onReply={vi.fn()}
      />
    );

    expect(screen.getByText("我会先整理方案，并把下一步拆清楚。")).toBeInTheDocument();
    expect(screen.queryByText(/handoff_request/)).not.toBeInTheDocument();
    expect(screen.queryByText(/targetRoleKey/)).not.toBeInTheDocument();
    expect(screen.queryByText(/acceptanceCriteria/)).not.toBeInTheDocument();
  });

  it("does not render inline handoff control arrays appended to markdown messages", () => {
    const markdown = [
      "## 技术方案",
      "",
      "| 模块 | 处理 |",
      "| --- | --- |",
      "| 交互层 | 保留用户可见说明 |",
      "",
      "下一步会继续拆分实现任务。"
    ].join("\n");
    const { container } = render(
      <ChatMessage
        artifacts={[]}
        isPinDisabled={false}
        isPinPending={false}
        message={makeMessage({
          content: `${markdown}
[{"type":"handoff_request","targetRoleKey":"builder","targetAgentId":"agent_builder","goal":"安排实现同事继续","acceptanceCriteria":["完成测试"],"constraints":["保持用户可配置"]},{"type":"handoff_request","targetRoleKey":"reviewer","goal":"安排复核","acceptanceCriteria":["完成复核"],"constraints":["不要改变用户可见正文"]}]`
        })}
        onPin={vi.fn()}
        onReply={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { name: "技术方案" })).toBeInTheDocument();
    expect(container.querySelector("table")).not.toBeNull();
    expect(container.textContent).not.toContain("handoff_request");
    expect(container.textContent).not.toContain("targetRoleKey");
    expect(container.textContent).not.toContain("constraints");
    expect(container.textContent).not.toContain("acceptanceCriteria");
  });

  it("renders assistant Markdown as structured content instead of plain text", () => {
    const { container } = render(
      <ChatMessage
        artifacts={[]}
        isPinDisabled={false}
        isPinPending={false}
        message={makeMessage({
          content: [
            "## 验收总结",
            "",
            "| 项目 | 状态 |",
            "| --- | --- |",
            "| Markdown 渲染 | 已完成 |",
            "",
            "```ts",
            "const done = true;",
            "```"
          ].join("\n")
        })}
        onPin={vi.fn()}
        onReply={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { name: "验收总结" })).toBeInTheDocument();
    expect(container.querySelector("table")).not.toBeNull();
    expect(container.querySelector("pre code")).toHaveTextContent("const done = true;");
    expect(container.textContent).not.toContain("## 验收总结");
    expect(container.textContent).not.toContain("| 项目 | 状态 |");
  });

  it("renders fenced diff blocks with line-level review markup", () => {
    const { container } = render(
      <ChatMessage
        artifacts={[]}
        isPinDisabled={false}
        isPinPending={false}
        message={makeMessage({
          content: [
            "```diff",
            "diff --git a/app.ts b/app.ts",
            "--- a/app.ts",
            "+++ b/app.ts",
            "@@ -1 +1 @@",
            "-old",
            "+new",
            "```"
          ].join("\n")
        })}
        onPin={vi.fn()}
        onReply={vi.fn()}
      />
    );

    expect(container.querySelector("[data-unified-diff]")).toBeInTheDocument();
    expect(container.querySelector('[data-diff-line-kind="removed"]')).toHaveTextContent("-old");
    expect(container.querySelector('[data-diff-line-kind="added"]')).toHaveTextContent("+new");
    expect(container.querySelector('[data-diff-line-kind="hunk"]')).toHaveTextContent("@@ -1 +1 @@");
  });

  it("renders runtime Markdown artifact statuses as plain UI text", () => {
    const { container } = render(
      <ChatMessage
        artifacts={[]}
        artifactStatuses={[
          {
            messageId: "msg_1",
            status: "creating",
            title: "实施计划",
            type: "markdown"
          },
          {
            error: "MinIO write failed.",
            messageId: "msg_1",
            status: "failed",
            title: "失败报告",
            type: "markdown"
          }
        ]}
        isPinDisabled={false}
        isPinPending={false}
        message={makeMessage()}
        onPin={vi.fn()}
        onReply={vi.fn()}
      />
    );

    expect(screen.getByText("正在生成 Markdown 文件：实施计划")).toBeInTheDocument();
    expect(screen.getByText("Markdown 文件生成失败：失败报告")).toBeInTheDocument();
    expect(screen.getByText("MinIO write failed.")).toBeInTheDocument();
    expect(container.textContent).not.toContain("artifactStatus");
    expect(container.textContent).not.toContain("messageId");
  });
  it("keeps ordinary JSON examples visible", () => {
    const jsonExample = JSON.stringify({
      fields: ["name", "price"],
      targetRoleKey: "example-only",
      type: "demo_payload"
    });

    render(
      <ChatMessage
        artifacts={[]}
        isPinDisabled={false}
        isPinPending={false}
        message={makeMessage({
          content: `可以按这个 JSON 示例返回：\n${jsonExample}`
        })}
        onPin={vi.fn()}
        onReply={vi.fn()}
      />
    );

    expect(screen.getByText((content) => content.includes(jsonExample))).toBeInTheDocument();
  });
});

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
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
    reactions: [],
    role: "assistant",
    sourceAgentId: "agent_1",
    threadLastReplyAt: null,
    threadParentMessageId: null,
    threadReplyCount: 0,
    workspaceId: "workspace_1",
    ...overrides
  };
}
