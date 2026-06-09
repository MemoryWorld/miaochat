// eslint-disable-next-line @typescript-eslint/no-require-imports -- Electron preload is emitted as CommonJS for sandbox compatibility.
const { contextBridge, ipcRenderer } = require("electron");

type ApprovalNotificationInput = {
  actionLabel: string;
  conversationTitle: string;
  workspaceName: string;
};

type LocalAgentConfig = {
  agentId: string;
  args: string[];
  command: string;
  workspaceId: string;
};

type ToolInvocationInput = {
  agentId: string;
  args?: Record<string, unknown>;
  toolName: string;
};

contextBridge.exposeInMainWorld("miaochatDesktop", {
  invokeAgentTool(input: ToolInvocationInput) {
    return ipcRenderer.invoke("desktop:agent.invokeTool", input);
  },
  listAgents() {
    return ipcRenderer.invoke("desktop:agent.list");
  },
  pickFilesForUpload() {
    return ipcRenderer.invoke("desktop:file.pickForUpload");
  },
  showApprovalNotification(input: ApprovalNotificationInput) {
    return ipcRenderer.invoke("desktop:notification.showApproval", input);
  },
  startAgent(config: LocalAgentConfig) {
    return ipcRenderer.invoke("desktop:agent.start", config);
  },
  stopAgent(agentId: string) {
    return ipcRenderer.invoke("desktop:agent.stop", { agentId });
  }
});
