// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChatComposer } from "./chat-composer";

describe("ChatComposer", () => {
  afterEach(() => {
    cleanup();
  });

  it("maps explicit member selections into mentioned ids without stripping Chinese names", async () => {
    const onSend = vi.fn(async () => undefined);

    render(
      <ChatComposer
        members={[
          {
            avatarUrl: null,
            displayName: "张三",
            joinedAt: null,
            kind: "human",
            lastActiveAt: null,
            memberId: "human:user_zhang",
            permission: "comment",
            role: "member",
            status: "active",
            userId: "user_zhang"
          },
          {
            avatarUrl: null,
            displayName: "软件工程师",
            joinedAt: null,
            kind: "ai",
            lastActiveAt: null,
            memberId: "ai:agent_engineer",
            permission: "comment",
            role: "ai_teammate",
            status: "available",
            teammateId: "agent_engineer"
          }
        ]}
        onSend={onSend}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "@张三" }));
    fireEvent.click(screen.getByRole("button", { name: "@软件工程师" }));
    fireEvent.change(screen.getByLabelText("消息内容"), {
      target: {
        value: "@张三 @软件工程师 请看下一步计划"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "发送消息" }));

    await waitFor(() => {
      expect(onSend).toHaveBeenCalledWith({
        attachments: [],
        content: "@张三 @软件工程师 请看下一步计划",
        mentionedAgentIds: ["agent_engineer"],
        mentionedUserIds: ["user_zhang"]
      });
    });
  });

  it("maps typed AI mention labels into mentioned agent ids", async () => {
    const onSend = vi.fn(async () => undefined);

    render(
      <ChatComposer
        members={[
          {
            avatarUrl: null,
            displayName: "方案规划同事",
            joinedAt: null,
            kind: "ai",
            lastActiveAt: null,
            memberId: "ai:agent_planner",
            permission: "comment",
            role: "ai_teammate",
            status: "available",
            teammateId: "agent_planner"
          },
          {
            avatarUrl: null,
            displayName: "执行落地同事",
            joinedAt: null,
            kind: "ai",
            lastActiveAt: null,
            memberId: "ai:agent_executor",
            permission: "comment",
            role: "ai_teammate",
            status: "available",
            teammateId: "agent_executor"
          }
        ]}
        onSend={onSend}
      />
    );

    fireEvent.change(screen.getByLabelText("消息内容"), {
      target: {
        value: "@方案规划同事 回归测试下一步"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "发送消息" }));

    await waitFor(() => {
      expect(onSend).toHaveBeenCalledWith({
        attachments: [],
        content: "@方案规划同事 回归测试下一步",
        mentionedAgentIds: ["agent_planner"],
        mentionedUserIds: []
      });
    });
  });

  it("keeps the draft when onSend reports failure", async () => {
    const onSend = vi.fn(async () => false);
    const attachment = new File(["draft"], "draft.txt", { type: "text/plain" });

    render(
      <ChatComposer
        members={[
          {
            avatarUrl: null,
            displayName: "软件工程师",
            joinedAt: null,
            kind: "ai",
            lastActiveAt: null,
            memberId: "ai:agent_engineer",
            permission: "comment",
            role: "ai_teammate",
            status: "available",
            teammateId: "agent_engineer"
          }
        ]}
        onSend={onSend}
      />
    );

    const memberButton = screen.getByRole("button", { name: "@软件工程师" });
    fireEvent.click(memberButton);
    fireEvent.change(screen.getByLabelText("选择文件"), {
      target: {
        files: [attachment]
      }
    });
    fireEvent.change(screen.getByLabelText("消息内容"), {
      target: {
        value: "@软件工程师 不要丢失这条草稿"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "发送消息" }));

    await waitFor(() => {
      expect(onSend).toHaveBeenCalledWith({
        attachments: [attachment],
        content: "@软件工程师 不要丢失这条草稿",
        mentionedAgentIds: ["agent_engineer"],
        mentionedUserIds: []
      });
    });
    expect(screen.getByLabelText("消息内容")).toHaveValue("@软件工程师 不要丢失这条草稿");
    expect(screen.getByText("1 个文件")).toBeInTheDocument();
    expect(memberButton).toHaveAttribute("aria-pressed", "true");
  });

  it("uses the workspace button style for file attachments while keeping the input accessible", () => {
    render(<ChatComposer onSend={async () => undefined} />);

    expect(screen.getByText("选择文件")).toBeInTheDocument();
    expect(screen.getByLabelText("选择文件")).toHaveAttribute("type", "file");
  });
});
