import type { DesktopFileBridge } from "./file-bridge.js";
import type { LocalAgentConfig, LocalAgentSupervisor } from "./agent-supervisor.js";
import type {
  ApprovalRequestNotificationInput,
  DesktopNotification,
  SystemNotificationsBridge
} from "./system-notifications.js";

export const desktopIpcChannels = {
  agentInvokeTool: "desktop:agent.invokeTool",
  agentList: "desktop:agent.list",
  agentStart: "desktop:agent.start",
  agentStop: "desktop:agent.stop",
  filePickForUpload: "desktop:file.pickForUpload",
  notificationShowApproval: "desktop:notification.showApproval"
} as const;

export type IpcMainLike = {
  handle: (channel: string, handler: (_event: unknown, payload?: unknown) => unknown) => void;
};

export type RegisterDesktopIpcHandlersOptions = {
  actorUserId: string;
  fileBridge: DesktopFileBridge;
  notifications: SystemNotificationsBridge;
  showNotification: (notification: DesktopNotification) => void;
  supervisor: LocalAgentSupervisor;
};

export function registerDesktopIpcHandlers(
  ipcMain: IpcMainLike,
  options: RegisterDesktopIpcHandlersOptions
): void {
  ipcMain.handle(desktopIpcChannels.filePickForUpload, async () =>
    options.fileBridge.selectForArtifactUpload()
  );

  ipcMain.handle(desktopIpcChannels.notificationShowApproval, (_event, payload) => {
    const notification = options.notifications.createApprovalRequest(
      parseApprovalNotificationInput(payload)
    );
    options.showNotification(notification);
    return notification;
  });

  ipcMain.handle(desktopIpcChannels.agentStart, async (_event, payload) => {
    const config = parseLocalAgentConfig(payload);

    return options.supervisor.startAgent({
      actorUserId: options.actorUserId,
      config
    });
  });

  ipcMain.handle(desktopIpcChannels.agentStop, async (_event, payload) => {
    const agentId = parseAgentId(payload);
    await options.supervisor.stopAgent({
      actorUserId: options.actorUserId,
      agentId
    });

    return {
      agentId,
      stopped: true
    };
  });

  ipcMain.handle(desktopIpcChannels.agentList, () => options.supervisor.listRunningAgents());

  ipcMain.handle(desktopIpcChannels.agentInvokeTool, async (_event, payload) => {
    if (!payload || typeof payload !== "object") {
      throw new Error("Desktop tool invocation payload is required.");
    }

    const raw = payload as {
      agentId?: unknown;
      args?: unknown;
      toolName?: unknown;
    };

    if (typeof raw.agentId !== "string" || typeof raw.toolName !== "string") {
      throw new Error("Desktop tool invocation requires agentId and toolName.");
    }

    return options.supervisor.invokeTool({
      agentId: raw.agentId,
      args: isRecord(raw.args) ? raw.args : undefined,
      toolName: raw.toolName
    });
  });
}

function parseApprovalNotificationInput(payload: unknown): ApprovalRequestNotificationInput {
  if (!payload || typeof payload !== "object") {
    throw new Error("Approval notification payload is required.");
  }

  const raw = payload as Record<string, unknown>;

  if (
    typeof raw.actionLabel !== "string" ||
    typeof raw.conversationTitle !== "string" ||
    typeof raw.workspaceName !== "string"
  ) {
    throw new Error("Approval notification payload is invalid.");
  }

  return {
    actionLabel: raw.actionLabel,
    conversationTitle: raw.conversationTitle,
    workspaceName: raw.workspaceName
  };
}

function parseLocalAgentConfig(payload: unknown): LocalAgentConfig {
  if (!payload || typeof payload !== "object") {
    throw new Error("Local agent config is required.");
  }

  const raw = payload as Record<string, unknown>;

  if (
    typeof raw.agentId !== "string" ||
    typeof raw.command !== "string" ||
    typeof raw.workspaceId !== "string" ||
    !Array.isArray(raw.args) ||
    !raw.args.every((arg) => typeof arg === "string")
  ) {
    throw new Error("Local agent config is invalid.");
  }

  return {
    agentId: raw.agentId,
    args: raw.args,
    command: raw.command,
    workspaceId: raw.workspaceId
  };
}

function parseAgentId(payload: unknown): string {
  if (
    payload &&
    typeof payload === "object" &&
    "agentId" in payload &&
    typeof payload.agentId === "string"
  ) {
    return payload.agentId;
  }

  throw new Error("agentId is required.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
