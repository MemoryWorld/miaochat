export type NotificationPreferences = {
  approvalRequests: boolean;
  assignedToMe: boolean;
  orchestratorFailures: boolean;
};

export type PushGatewayEvent =
  | {
      assigneeLabel: string;
      kind: "assigned_to_me";
      recipientUserId: string;
      workspaceId: string;
    }
  | {
      conversationId: string;
      kind: "approval_request";
      recipientUserId: string;
      workspaceId: string;
    }
  | {
      conversationId: string;
      failingAgentName: string;
      kind: "orchestrator_failure";
      recipientUserId: string;
      workspaceId: string;
    };

export type PushNotificationPayload = {
  body: string;
  data: {
    conversationId?: string;
    eventKind: PushGatewayEvent["kind"];
    workspaceId: string;
  };
  title: string;
};

export type PushDeliveryResult =
  | {
      delivered: true;
      payload: PushNotificationPayload;
    }
  | {
      delivered: false;
      reason: "disabled_preference";
    };

export class PushGatewayService {
  constructor(
    private readonly sendPush: (payload: PushNotificationPayload) => Promise<void>
  ) {}

  async deliver(input: {
    event: PushGatewayEvent;
    preferences: NotificationPreferences;
  }): Promise<PushDeliveryResult> {
    if (!isEnabled(input.event.kind, input.preferences)) {
      return {
        delivered: false,
        reason: "disabled_preference"
      };
    }

    const payload = buildPayload(input.event);
    await this.sendPush(payload);

    return {
      delivered: true,
      payload
    };
  }
}

function isEnabled(
  eventKind: PushGatewayEvent["kind"],
  preferences: NotificationPreferences
): boolean {
  switch (eventKind) {
    case "assigned_to_me":
      return preferences.assignedToMe;
    case "approval_request":
      return preferences.approvalRequests;
    case "orchestrator_failure":
      return preferences.orchestratorFailures;
  }
}

function buildPayload(event: PushGatewayEvent): PushNotificationPayload {
  switch (event.kind) {
    case "assigned_to_me":
      return {
        body: `${event.assigneeLabel} assigned work in ${event.workspaceId}.`,
        data: {
          eventKind: event.kind,
          workspaceId: event.workspaceId
        },
        title: "Assigned to you"
      };
    case "approval_request":
      return {
        body: `Approval requested in conversation ${event.conversationId}.`,
        data: {
          conversationId: event.conversationId,
          eventKind: event.kind,
          workspaceId: event.workspaceId
        },
        title: "Approval request"
      };
    case "orchestrator_failure":
      return {
        body: `${event.failingAgentName} needs attention in conversation ${event.conversationId}.`,
        data: {
          conversationId: event.conversationId,
          eventKind: event.kind,
          workspaceId: event.workspaceId
        },
        title: "Workflow escalation"
      };
  }
}
