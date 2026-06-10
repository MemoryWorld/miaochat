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

  it("suggests members while typing @ and inserts the picked label", async () => {
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

    const textarea = screen.getByLabelText("消息内容");

    fireEvent.change(textarea, { target: { value: "@规划" } });

    const popover = await screen.findByTestId("mention-suggestions");
    expect(popover).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /方案规划同事/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /执行落地同事/ })).not.toBeInTheDocument();

    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(textarea).toHaveValue("@方案规划同事 ");
    expect(screen.queryByTestId("mention-suggestions")).not.toBeInTheDocument();
    // 弹层打开时的 Enter 是选人，不应触发发送
    expect(onSend).not.toHaveBeenCalled();

    fireEvent.change(textarea, { target: { value: "@方案规划同事 安排下一步" } });
    fireEvent.click(screen.getByRole("button", { name: "发送消息" }));

    await waitFor(() => {
      expect(onSend).toHaveBeenCalledWith({
        attachments: [],
        content: "@方案规划同事 安排下一步",
        mentionedAgentIds: ["agent_planner"],
        mentionedUserIds: []
      });
    });
  });

  it("drops a mention when its label is removed from the content", async () => {
    const onSend = vi.fn(async () => undefined);

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
    expect(screen.getByLabelText("消息内容")).toHaveValue("@软件工程师 ");

    // 用户删掉 @ 标签改发普通消息：不应再带 mention
    fireEvent.change(screen.getByLabelText("消息内容"), {
      target: { value: "请大家一起讨论一下方案" }
    });
    expect(memberButton).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(screen.getByRole("button", { name: "发送消息" }));

    await waitFor(() => {
      expect(onSend).toHaveBeenCalledWith({
        attachments: [],
        content: "请大家一起讨论一下方案",
        mentionedAgentIds: [],
        mentionedUserIds: []
      });
    });
  });

  it("removes the mention label when the member chip is toggled off", () => {
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
        onSend={async () => undefined}
      />
    );

    const memberButton = screen.getByRole("button", { name: "@软件工程师" });
    const textarea = screen.getByLabelText("消息内容");

    fireEvent.click(memberButton);
    fireEvent.change(textarea, { target: { value: "@软件工程师 请评审这段代码" } });

    fireEvent.click(memberButton);

    expect(textarea).toHaveValue("请评审这段代码");
    expect(memberButton).toHaveAttribute("aria-pressed", "false");
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

  it("keeps editing available while submit is disabled with a visible reason", () => {
    const onSend = vi.fn(async () => undefined);

    render(
      <ChatComposer
        disabledReason="正在连接实时流，稍后即可发送。"
        onSend={onSend}
        submitDisabled
      />
    );

    const textarea = screen.getByLabelText("消息内容");

    expect(textarea).not.toBeDisabled();
    expect(screen.getByText("正在连接实时流，稍后即可发送。")).toBeInTheDocument();

    fireEvent.change(textarea, {
      target: {
        value: "连接好以后再发送这条消息"
      }
    });

    const sendButton = screen.getByRole("button", { name: "发送消息" });
    expect(sendButton).toBeDisabled();

    fireEvent.click(sendButton);

    expect(onSend).not.toHaveBeenCalled();
    expect(textarea).toHaveValue("连接好以后再发送这条消息");
  });

  it("uses the workspace button style for file attachments while keeping the input accessible", () => {
    render(<ChatComposer onSend={async () => undefined} />);

    expect(screen.getByText("选择文件")).toBeInTheDocument();
    expect(screen.getByLabelText("选择文件")).toHaveAttribute("type", "file");
  });
});
