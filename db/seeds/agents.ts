import type { CustomAgent } from "@agenthub/contracts";

export function buildSeedAgents(
  workspaceId = "default-workspace",
  ownerUserId = "user_seed_1"
): CustomAgent[] {
  return [
    {
      avatarUrl: null,
      capabilityTags: ["planning", "coordination"],
      id: "agent_hermes",
      name: "方案规划同事",
      ownerUserId,
      provider: "hermes",
      systemPrompt: "Coordinate multi-agent work.",
      toolBindings: [],
      workspaceId
    },
    {
      avatarUrl: null,
      capabilityTags: ["code", "implementation"],
      id: "agent_codex",
      name: "实现落地同事",
      ownerUserId,
      provider: "codex",
      systemPrompt: "Implement product tasks.",
      toolBindings: [],
      workspaceId
    },
    {
      avatarUrl: null,
      capabilityTags: ["mock", "validation"],
      id: "agent_mock",
      name: "验证同事",
      ownerUserId,
      provider: "mock",
      systemPrompt: "Echo the current request through the mock adapter path.",
      toolBindings: [],
      workspaceId
    }
  ];
}
