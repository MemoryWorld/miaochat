import { describe, expect, it } from "vitest";

import {
  evaluateStagingAcceptanceReadiness,
  formatLoadSeedEnvironment,
  parseGitHubRepoSlug
} from "../scripts/staging/support.js";

describe("staging acceptance support", () => {
  it("parses GitHub repository slugs from common origin URL shapes", () => {
    expect(parseGitHubRepoSlug("https://github.com/MemoryWorld/miaochat.git")).toBe(
      "MemoryWorld/miaochat"
    );
    expect(parseGitHubRepoSlug("git@github.com:MemoryWorld/miaochat.git")).toBe(
      "MemoryWorld/miaochat"
    );
  });

  it("reports missing workflow, missing environment, and missing secrets", () => {
    const result = evaluateStagingAcceptanceReadiness({
      environmentExists: false,
      expectedSecrets: [
        "AGENTHUB_API_BASE_URL",
        "AGENTHUB_WEB_BASE_URL",
        "CODEX_REAL_SECRET"
      ],
      presentSecrets: ["AGENTHUB_API_BASE_URL"],
      workflowAvailableOnDefaultBranch: false
    });

    expect(result.isReady).toBe(false);
    expect(result.missingSecrets).toEqual([
      "AGENTHUB_WEB_BASE_URL",
      "CODEX_REAL_SECRET"
    ]);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        "GitHub environment \"staging\" does not exist.",
        "Workflow staging-provider-acceptance.yml is not available on the default branch."
      ])
    );
  });

  it("formats load-seed output as exportable environment variables", () => {
    expect(
      formatLoadSeedEnvironment({
        directConversationIds: ["conv_direct_1", "conv_direct_2"],
        groupConversationIds: ["conv_group_1"],
        streamConversationIds: ["conv_stream_1", "conv_stream_2"],
        workspaceId: "default-workspace"
      })
    ).toContain("export AGENTHUB_LOAD_CONVERSATION_IDS=conv_direct_1,conv_direct_2");
  });
});
