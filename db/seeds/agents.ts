import type { CustomAgent } from "@agenthub/contracts";

export function buildSeedAgents(workspaceId = "default-workspace"): CustomAgent[] {
  return [
    {
      avatarUrl: null,
      capabilityTags: ["planning", "coordination"],
      id: "agent_hermes",
      name: "Hermes Planner",
      provider: "hermes",
      systemPrompt: "Coordinate multi-agent work.",
      toolBindings: [],
      workspaceId
    },
    {
      avatarUrl: null,
      capabilityTags: ["code", "implementation"],
      id: "agent_codex",
      name: "Codex Builder",
      provider: "codex",
      systemPrompt: "Implement product tasks.",
      toolBindings: [],
      workspaceId
    },
    {
      avatarUrl: null,
      capabilityTags: ["mock", "validation"],
      id: "agent_mock",
      name: "Mock Builder",
      provider: "mock",
      systemPrompt: "Echo the current request through the mock adapter path.",
      toolBindings: [],
      workspaceId
    }
  ];
}
