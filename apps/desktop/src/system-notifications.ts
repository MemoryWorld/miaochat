export type DesktopNotification = {
  body: string;
  channel: "approval-request" | "workspace-alert";
  metadata: Record<string, string>;
  title: string;
};

export type ApprovalRequestNotificationInput = {
  actionLabel: string;
  conversationTitle: string;
  workspaceName: string;
};

export type SystemNotificationsBridge = {
  createApprovalRequest: (
    input: ApprovalRequestNotificationInput
  ) => DesktopNotification;
};

export function createSystemNotificationsBridge(): SystemNotificationsBridge {
  return {
    createApprovalRequest(input) {
      return {
        body: `${input.actionLabel} is waiting in ${input.conversationTitle}.`,
        channel: "approval-request",
        metadata: {
          conversationTitle: input.conversationTitle,
          workspaceName: input.workspaceName
        },
        title: `Approval needed in ${input.workspaceName}`
      };
    }
  };
}
