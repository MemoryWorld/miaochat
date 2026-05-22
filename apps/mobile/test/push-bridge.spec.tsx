import { describe, expect, it } from "vitest";

import { createPushBridge } from "../src/notifications/push-bridge";

describe("mobile push bridge", () => {
  it("maps a workspace-scoped push payload into a client notification model", () => {
    const bridge = createPushBridge();
    const notification = bridge.toClientNotification({
      body: "Codex Builder needs approval for the release push.",
      data: {
        conversationId: "conv_mobile_push",
        eventKind: "approval_request",
        workspaceId: "workspace_mobile"
      },
      title: "Approval request"
    });

    expect(notification.route).toBe("/workspaces/workspace_mobile/conversations/conv_mobile_push");
    expect(notification.title).toBe("Approval request");
    expect(notification.workspaceId).toBe("workspace_mobile");
  });
});
