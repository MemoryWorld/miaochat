import { describe, expect, it } from "vitest";

import { createLocalAgentSupervisor } from "../../apps/desktop/src/agent-supervisor.js";
import { createDesktopToolBridge } from "../../apps/desktop/src/tool-bridge.js";

describe("desktop agent supervisor", () => {
  it("starts a local agent, forwards tool calls through the sandbox bridge, and records lifecycle audit events", async () => {
    const supervisor = createLocalAgentSupervisor({
      launchProcess: async () => ({
        pid: 1337,
        stop: async () => undefined
      }),
      toolBridge: createDesktopToolBridge({
        handlers: {
          summarize: async ({ args }) => ({
            summary: String(args.text).toUpperCase()
          })
        }
      })
    });

    await supervisor.startAgent({
      actorUserId: "user_owner",
      config: {
        agentId: "desktop_local_agent",
        args: ["--workspace", "workspace_desktop"],
        command: "local-agent",
        workspaceId: "workspace_desktop"
      }
    });

    const toolResult = await supervisor.invokeTool({
      agentId: "desktop_local_agent",
      args: {
        text: "ship it"
      },
      toolName: "summarize"
    });

    await supervisor.stopAgent({
      actorUserId: "user_owner",
      agentId: "desktop_local_agent"
    });

    expect(toolResult.result).toEqual({
      summary: "SHIP IT"
    });
    expect(toolResult.durationMs).toBeGreaterThanOrEqual(0);
    expect(
      supervisor.listAuditEvents().map((event) => ({
        action: event.action,
        actorUserId: event.actorUserId,
        resourceId: event.resourceId,
        workspaceId: event.workspaceId
      }))
    ).toEqual([
      {
        action: "desktop.agent.started",
        actorUserId: "user_owner",
        resourceId: "desktop_local_agent",
        workspaceId: "workspace_desktop"
      },
      {
        action: "desktop.agent.stopped",
        actorUserId: "user_owner",
        resourceId: "desktop_local_agent",
        workspaceId: "workspace_desktop"
      }
    ]);
  });
});
