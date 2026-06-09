import { describe, expect, it } from "vitest";

import {
  desktopIpcChannels,
  registerDesktopIpcHandlers,
  type IpcMainLike
} from "../src/desktop-ipc.js";
import { createLocalAgentSupervisor } from "../src/agent-supervisor.js";
import { createDesktopFileBridge } from "../src/file-bridge.js";
import { createSystemNotificationsBridge } from "../src/system-notifications.js";
import { createDesktopToolBridge } from "../src/tool-bridge.js";

describe("desktop ipc handlers", () => {
  it("bridges file picking, notifications, and local agent lifecycle", async () => {
    const handlers = new Map<string, (_event: unknown, payload?: unknown) => unknown>();
    const ipcMain: IpcMainLike = {
      handle(channel, handler) {
        handlers.set(channel, handler);
      }
    };
    const shownNotifications: string[] = [];
    const stoppedPids: number[] = [];
    const supervisor = createLocalAgentSupervisor({
      launchProcess: async () => ({
        pid: 9090,
        stop: async () => {
          stoppedPids.push(9090);
        }
      }),
      toolBridge: createDesktopToolBridge({
        handlers: {
          echo: async ({ args }) => ({
            echoed: args.payload
          })
        }
      })
    });

    registerDesktopIpcHandlers(ipcMain, {
      actorUserId: "desktop_user",
      fileBridge: createDesktopFileBridge({
        pickFiles: async () => ["/Users/demo/plan.md"]
      }),
      notifications: createSystemNotificationsBridge(),
      showNotification(notification) {
        shownNotifications.push(notification.title);
      },
      supervisor
    });

    await expect(
      invoke(handlers, desktopIpcChannels.filePickForUpload)
    ).resolves.toEqual([
      {
        fileName: "plan.md",
        localPath: "/Users/demo/plan.md",
        title: "plan.md"
      }
    ]);
    await expect(
      invoke(handlers, desktopIpcChannels.notificationShowApproval, {
        actionLabel: "批准计划",
        conversationTitle: "移动端 MVP",
        workspaceName: "比赛交付"
      })
    ).resolves.toMatchObject({
      channel: "approval-request",
      title: "Approval needed in 比赛交付"
    });
    expect(shownNotifications).toEqual(["Approval needed in 比赛交付"]);

    await expect(
      invoke(handlers, desktopIpcChannels.agentStart, {
        agentId: "local_agent",
        args: ["--workspace", "workspace_desktop"],
        command: "local-agent",
        workspaceId: "workspace_desktop"
      })
    ).resolves.toEqual({
      agentId: "local_agent",
      pid: 9090,
      status: "running"
    });
    await expect(invoke(handlers, desktopIpcChannels.agentList)).resolves.toEqual([
      {
        agentId: "local_agent",
        pid: 9090,
        workspaceId: "workspace_desktop"
      }
    ]);
    await expect(
      invoke(handlers, desktopIpcChannels.agentInvokeTool, {
        agentId: "local_agent",
        args: {
          payload: "hello"
        },
        toolName: "echo"
      })
    ).resolves.toMatchObject({
      result: {
        echoed: "hello"
      },
      toolName: "echo"
    });
    await expect(
      invoke(handlers, desktopIpcChannels.agentStop, {
        agentId: "local_agent"
      })
    ).resolves.toEqual({
      agentId: "local_agent",
      stopped: true
    });
    expect(stoppedPids).toEqual([9090]);
  });
});

async function invoke(
  handlers: Map<string, (_event: unknown, payload?: unknown) => unknown>,
  channel: string,
  payload?: unknown
): Promise<unknown> {
  const handler = handlers.get(channel);

  if (!handler) {
    throw new Error(`Missing handler for ${channel}`);
  }

  return handler({}, payload);
}
