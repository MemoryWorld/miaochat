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

  it("uses the workspace button style for file attachments while keeping the input accessible", () => {
    render(<ChatComposer onSend={async () => undefined} />);

    expect(screen.getByText("选择文件")).toBeInTheDocument();
    expect(screen.getByLabelText("选择文件")).toHaveAttribute("type", "file");
  });
});
