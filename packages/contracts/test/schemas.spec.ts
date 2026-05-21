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

  it("requires group conversations to include at least two agents", () => {
    const parsed = createConversationInputSchema.safeParse({
      agentIds: ["agent_1"],
      mode: "group"
    });

    expect(parsed.success).toBe(false);
  });
});
