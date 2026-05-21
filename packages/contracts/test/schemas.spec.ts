import { describe, expect, it } from "vitest";

import {
  conversationSchema,
  createConversationInputSchema,
  createCustomAgentInputSchema,
  createProviderCredentialInputSchema,
  streamEventSchema
} from "../src";

describe("@agenthub/contracts", () => {
  it("accepts future-ready workspace fields on conversations", () => {
    const parsed = conversationSchema.parse({
      id: "conv_1",
      mode: "group",
      ownerUserId: "user_1",
      participants: [{ agentId: "agent_1", agentName: "Hermes" }],
      pinnedMessageIds: [],
      title: "Planning",
      updatedAt: new Date().toISOString(),
      workspaceId: "workspace_1"
    });

    expect(parsed.workspaceId).toBe("workspace_1");
  });

  it("keeps provider credentials on the BYOK path by default", () => {
    const parsed = createProviderCredentialInputSchema.parse({
      label: "Main Codex",
      provider: "codex",
      providerAccountId: "acct_1",
      rawSecret: "secret_123"
    });

    expect(parsed.credentialSource).toBe("user_provided");
  });

  it("supports heavy custom-agent tool bindings", () => {
    const parsed = createCustomAgentInputSchema.parse({
      capabilityTags: ["code", "review"],
      name: "Reviewer",
      provider: "mock",
      systemPrompt: "Review changes",
      toolBindings: [
        {
          configPath: "/srv/tools/reviewer.json",
          name: "repo-review",
          runtime: "config_file"
        }
      ]
    });

    expect(parsed.toolBindings).toHaveLength(1);
  });

  it("validates normalized stream events", () => {
    const parsed = streamEventSchema.parse({
      kind: "conversation.message.delta",
      payload: {
        delta: "Hello",
        messageId: "msg_1"
      }
    });

    expect(parsed.kind).toBe("conversation.message.delta");
  });

  it("supports structured orchestrator status events", () => {
    const parsed = streamEventSchema.parse({
      kind: "conversation.status",
      payload: {
        failures: [
          {
            agentId: "agent_failure",
            agentName: "Failure Scout",
            code: "error",
            detail: "Mock dispatch failed before completion.",
            provider: "mock"
          }
        ],
        label: "orchestrator.partial_failure",
        state: "failed",
        successfulAgentCount: 1,
        summary: "1 of 2 agents failed or timed out. Aggregated the remaining result.",
        totalAgentCount: 2
      }
    });

    expect(parsed.payload.failures).toHaveLength(1);
    expect(parsed.payload.label).toBe("orchestrator.partial_failure");
  });

  it("requires group conversations to include at least two agents", () => {
    const parsed = createConversationInputSchema.safeParse({
      agentIds: ["agent_1"],
      mode: "group"
    });

    expect(parsed.success).toBe(false);
  });
});
