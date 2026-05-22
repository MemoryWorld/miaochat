import type {
  DesktopToolBridge,
  DesktopToolInvocationResult
} from "./tool-bridge.js";

export type LocalAgentConfig = {
  agentId: string;
  args: string[];
  command: string;
  workspaceId: string;
};

export type LocalAgentProcessHandle = {
  pid: number;
  stop: () => Promise<void>;
};

export type SupervisorAuditEvent = {
  action: "desktop.agent.started" | "desktop.agent.stopped";
  actorUserId: string;
  details: Record<string, string | number>;
  resourceId: string;
  resourceType: "desktop_agent";
  workspaceId: string;
};

export type LocalAgentSupervisor = {
  invokeTool: (input: {
    agentId: string;
    args?: Record<string, unknown>;
    toolName: string;
  }) => Promise<DesktopToolInvocationResult>;
  listAuditEvents: () => SupervisorAuditEvent[];
  listRunningAgents: () => Array<{ agentId: string; pid: number; workspaceId: string }>;
  startAgent: (input: {
    actorUserId: string;
    config: LocalAgentConfig;
  }) => Promise<{ agentId: string; pid: number; status: "running" }>;
  stopAgent: (input: { actorUserId: string; agentId: string }) => Promise<void>;
};

export type CreateLocalAgentSupervisorOptions = {
  launchProcess: (config: LocalAgentConfig) => Promise<LocalAgentProcessHandle>;
  toolBridge: DesktopToolBridge;
};

export function createLocalAgentSupervisor(
  options: CreateLocalAgentSupervisorOptions
): LocalAgentSupervisor {
  const runningAgents = new Map<
    string,
    {
      config: LocalAgentConfig;
      process: LocalAgentProcessHandle;
    }
  >();
  const auditEvents: SupervisorAuditEvent[] = [];

  return {
    async startAgent(input) {
      if (runningAgents.has(input.config.agentId)) {
        throw new Error(`Agent "${input.config.agentId}" is already running.`);
      }

      const process = await options.launchProcess(input.config);
      runningAgents.set(input.config.agentId, {
        config: input.config,
        process
      });
      auditEvents.push({
        action: "desktop.agent.started",
        actorUserId: input.actorUserId,
        details: {
          command: input.config.command,
          pid: process.pid
        },
        resourceId: input.config.agentId,
        resourceType: "desktop_agent",
        workspaceId: input.config.workspaceId
      });

      return {
        agentId: input.config.agentId,
        pid: process.pid,
        status: "running"
      };
    },

    async stopAgent(input) {
      const running = runningAgents.get(input.agentId);

      if (!running) {
        throw new Error(`Agent "${input.agentId}" is not running.`);
      }

      await running.process.stop();
      runningAgents.delete(input.agentId);
      auditEvents.push({
        action: "desktop.agent.stopped",
        actorUserId: input.actorUserId,
        details: {
          command: running.config.command,
          pid: running.process.pid
        },
        resourceId: input.agentId,
        resourceType: "desktop_agent",
        workspaceId: running.config.workspaceId
      });
    },

    async invokeTool(input) {
      const running = runningAgents.get(input.agentId);

      if (!running) {
        throw new Error(`Agent "${input.agentId}" is not running.`);
      }

      return options.toolBridge.invoke({
        args: input.args,
        toolName: input.toolName
      });
    },

    listAuditEvents() {
      return [...auditEvents];
    },

    listRunningAgents() {
      return [...runningAgents.values()].map((entry) => ({
        agentId: entry.config.agentId,
        pid: entry.process.pid,
        workspaceId: entry.config.workspaceId
      }));
    }
  };
}
