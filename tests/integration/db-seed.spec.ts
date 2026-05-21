import { describe, expect, it } from "vitest";

import { buildSeedAgents } from "../../db/seeds/agents";
import { buildSeedConversations } from "../../db/seeds/conversations";

describe("database seeds", () => {
  it("produces a minimal agent set for local development", () => {
    const agents = buildSeedAgents();

    expect(agents.map((agent) => agent.provider)).toEqual([
      "hermes",
      "codex",
      "mock"
    ]);
  });

  it("links seeded conversations and messages under one workspace", () => {
    const { conversations, messages } = buildSeedConversations("workspace_seed");

    expect(conversations[0]?.workspaceId).toBe("workspace_seed");
    expect(messages[0]?.conversationId).toBe(conversations[0]?.id);
    expect(messages[0]?.isPinned).toBe(true);
  });
});
