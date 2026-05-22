import { describe, expect, it } from "vitest";

import { createLocalAgentSupervisor } from "../src/agent-supervisor.js";
import { createDesktopToolBridge } from "../src/tool-bridge.js";

describe("local agent supervisor", () => {
  it("starts and stops a local agent while recording workspace-scoped audit events", async () => {
    const supervisor = createLocalAgentSupervisor({
      launchProcess: async () => ({
        pid: 4242,
        stop: async () => undefined
      }),
      toolBridge: createDesktopToolBridge({
        handlers: {}
      })
    });

    const running = await supervisor.startAgent({
      actorUserId: "user_owner",
      config: {
        agentId: "local_codex",
        args: ["serve"],
        command: "codex-agent",
        workspaceId: "workspace_desktop"
      }
    });

    expect(running).toEqual({
      agentId: "local_codex",
      pid: 4242,
      status: "running"
    });

    await supervisor.stopAgent({
      actorUserId: "user_owner",
      agentId: "local_codex"
    });

    expect(
      supervisor.listAuditEvents().map((event) => ({
        action: event.action,
        resourceId: event.resourceId,
        workspaceId: event.workspaceId
      }))
    ).toEqual([
      {
        action: "desktop.agent.started",
        resourceId: "local_codex",
        workspaceId: "workspace_desktop"
      },
      {
        action: "desktop.agent.stopped",
        resourceId: "local_codex",
        workspaceId: "workspace_desktop"
      }
    ]);
  });

  it("routes tool invocations through the desktop tool bridge", async () => {
    const supervisor = createLocalAgentSupervisor({
      launchProcess: async () => ({
        pid: 7,
        stop: async () => undefined
      }),
      toolBridge: createDesktopToolBridge({
        handlers: {
          echo: async ({ args }) => ({
            echoed: args.payload
          })
        }
      })
    });

    await supervisor.startAgent({
      actorUserId: "user_owner",
      config: {
        agentId: "local_echo",
        args: [],
        command: "echo-agent",
        workspaceId: "workspace_desktop"
      }
    });

    const result = await supervisor.invokeTool({
      agentId: "local_echo",
      args: {
        payload: "hello"
      },
      toolName: "echo"
    });

    expect(result.result).toEqual({
      echoed: "hello"
    });
    expect(result.toolName).toBe("echo");
  });

  it("rejects duplicate launches for the same agent id", async () => {
    const supervisor = createLocalAgentSupervisor({
      launchProcess: async () => ({
        pid: 99,
        stop: async () => undefined
      }),
      toolBridge: createDesktopToolBridge({
        handlers: {}
      })
    });

    await supervisor.startAgent({
      actorUserId: "user_owner",
      config: {
        agentId: "local_repeat",
        args: [],
        command: "repeat-agent",
        workspaceId: "workspace_desktop"
      }
    });

    await expect(
      supervisor.startAgent({
        actorUserId: "user_owner",
        config: {
          agentId: "local_repeat",
          args: [],
          command: "repeat-agent",
          workspaceId: "workspace_desktop"
        }
      })
    ).rejects.toThrow('Agent "local_repeat" is already running.');
  });
});
