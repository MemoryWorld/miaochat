export type PushBridgeInput = {
  body: string;
  data: {
    conversationId?: string;
    eventKind: "approval_request" | "assigned_to_me" | "orchestrator_failure";
    workspaceId: string;
  };
  title: string;
};

export type ClientPushNotification = {
  body: string;
  route: string;
  title: string;
  workspaceId: string;
};

export type PushBridge = {
  toClientNotification: (payload: PushBridgeInput) => ClientPushNotification;
};

export function createPushBridge(): PushBridge {
  return {
    toClientNotification(payload) {
      const route = payload.data.conversationId
        ? `/workspaces/${payload.data.workspaceId}/conversations/${payload.data.conversationId}`
        : `/workspaces/${payload.data.workspaceId}`;

      return {
        body: payload.body,
        route,
        title: payload.title,
        workspaceId: payload.data.workspaceId
      };
    }
  };
}
