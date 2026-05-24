import { getRequiredStagingEnvironment } from "../../tests/e2e/real-provider-test-support.js";

export const STAGING_ENVIRONMENT_NAME = "staging";
export const STAGING_WORKFLOW_FILE = "staging-provider-acceptance.yml";

export type StagingAcceptanceReadiness = {
  environmentExists: boolean;
  expectedSecrets: string[];
  presentSecrets: string[];
  workflowAvailableOnDefaultBranch: boolean;
};

export type StagingAcceptanceReadinessResult = {
  environmentExists: boolean;
  isReady: boolean;
  issues: string[];
  missingSecrets: string[];
  workflowAvailableOnDefaultBranch: boolean;
};

export type LoadSeedEnvironment = {
  directConversationIds: string[];
  groupConversationIds: string[];
  streamConversationIds: string[];
  workspaceId: string;
};

export type MockLoadAgentDraft = {
  capabilityTags: string[];
  name: string;
  provider: "mock";
  systemPrompt: string;
  toolBindings: [];
  workspaceId: string;
};

export function getExpectedStagingSecretNames(): string[] {
  return [...new Set(getRequiredStagingEnvironment())].sort();
}

export function parseGitHubRepoSlug(originUrl: string): string {
  const trimmed = originUrl.trim();
  const match = trimmed.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/);

  if (!match) {
    throw new Error(`Could not parse GitHub repository slug from: ${originUrl}`);
  }

  return `${match[1]}/${match[2]}`;
}

export function evaluateStagingAcceptanceReadiness(
  input: StagingAcceptanceReadiness
): StagingAcceptanceReadinessResult {
  const missingSecrets = input.expectedSecrets.filter(
    (name) => !input.presentSecrets.includes(name)
  );
  const issues: string[] = [];

  if (!input.environmentExists) {
    issues.push(`GitHub environment "${STAGING_ENVIRONMENT_NAME}" does not exist.`);
  }

  if (!input.workflowAvailableOnDefaultBranch) {
    issues.push(
      `Workflow ${STAGING_WORKFLOW_FILE} is not available on the default branch.`
    );
  }

  if (missingSecrets.length > 0) {
    issues.push(
      `Missing ${missingSecrets.length} staging secret(s): ${missingSecrets.join(", ")}`
    );
  }

  return {
    environmentExists: input.environmentExists,
    isReady:
      input.environmentExists &&
      input.workflowAvailableOnDefaultBranch &&
      missingSecrets.length === 0,
    issues,
    missingSecrets,
    workflowAvailableOnDefaultBranch: input.workflowAvailableOnDefaultBranch
  };
}

export function formatLoadSeedEnvironment(input: LoadSeedEnvironment): string {
  return [
    `export AGENTHUB_WORKSPACE_ID=${input.workspaceId}`,
    `export AGENTHUB_LOAD_CONVERSATION_IDS=${input.directConversationIds.join(",")}`,
    `export AGENTHUB_LOAD_GROUP_CONVERSATION_IDS=${input.groupConversationIds.join(",")}`,
    `export AGENTHUB_LOAD_STREAM_CONVERSATION_IDS=${input.streamConversationIds.join(",")}`
  ].join("\n");
}

export function buildMockLoadAgentDrafts(
  labelPrefix: string,
  workspaceId: string
): {
  direct: MockLoadAgentDraft;
  groupA: MockLoadAgentDraft;
  groupB: MockLoadAgentDraft;
} {
  return {
    direct: {
      capabilityTags: ["load", "mock", "direct"],
      name: `${labelPrefix} Direct Mock`,
      provider: "mock",
      systemPrompt: "Reply through the mock single-agent path for load validation.",
      toolBindings: [],
      workspaceId
    },
    groupA: {
      capabilityTags: ["load", "mock", "group"],
      name: `${labelPrefix} Group Mock A`,
      provider: "mock",
      systemPrompt: "Reply through the mock group orchestration path as participant A.",
      toolBindings: [],
      workspaceId
    },
    groupB: {
      capabilityTags: ["load", "mock", "group"],
      name: `${labelPrefix} Group Mock B`,
      provider: "mock",
      systemPrompt: "Reply through the mock group orchestration path as participant B.",
      toolBindings: [],
      workspaceId
    }
  };
}
