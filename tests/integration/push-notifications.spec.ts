import { describe, expect, it } from "vitest";

import {
  PushGatewayService,
  type PushNotificationPayload
} from "../../apps/api/src/modules/notifications/push-gateway.service.js";

describe("push notification gateway", () => {
  it("delivers assigned, approval, and orchestrator-failure pushes when enabled", async () => {
    const delivered: PushNotificationPayload[] = [];
    const gateway = new PushGatewayService(async (payload) => {
      delivered.push(payload);
    });

    const assigned = await gateway.deliver({
      event: {
        assigneeLabel: "Codex Builder",
        kind: "assigned_to_me",
        recipientUserId: "user_mobile",
        workspaceId: "workspace_mobile"
      },
      preferences: {
        approvalRequests: true,
        assignedToMe: true,
        orchestratorFailures: true
      }
    });
    const approval = await gateway.deliver({
      event: {
        conversationId: "conv_mobile_push",
        kind: "approval_request",
        recipientUserId: "user_mobile",
        workspaceId: "workspace_mobile"
      },
      preferences: {
        approvalRequests: true,
        assignedToMe: true,
        orchestratorFailures: true
      }
    });
    const failure = await gateway.deliver({
      event: {
        conversationId: "conv_mobile_push",
        failingAgentName: "Timeout Watcher",
        kind: "orchestrator_failure",
        recipientUserId: "user_mobile",
        workspaceId: "workspace_mobile"
      },
      preferences: {
        approvalRequests: true,
        assignedToMe: true,
        orchestratorFailures: true
      }
    });

    expect(assigned.delivered).toBe(true);
    expect(approval.delivered).toBe(true);
    expect(failure.delivered).toBe(true);
    expect(delivered).toHaveLength(3);
    expect(delivered.map((payload) => payload.data.eventKind)).toEqual([
      "assigned_to_me",
      "approval_request",
      "orchestrator_failure"
    ]);
    expect(delivered.every((payload) => payload.data.workspaceId === "workspace_mobile")).toBe(
      true
    );
  });

  it("suppresses pushes when the matching preference is disabled", async () => {
    const delivered: PushNotificationPayload[] = [];
    const gateway = new PushGatewayService(async (payload) => {
      delivered.push(payload);
    });

    const result = await gateway.deliver({
      event: {
        conversationId: "conv_mobile_push",
        kind: "approval_request",
        recipientUserId: "user_mobile",
        workspaceId: "workspace_mobile"
      },
      preferences: {
        approvalRequests: false,
        assignedToMe: true,
        orchestratorFailures: true
      }
    });

    expect(result).toEqual({
      delivered: false,
      reason: "disabled_preference"
    });
    expect(delivered).toHaveLength(0);
  });
});
