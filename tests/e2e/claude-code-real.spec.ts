import { describe, expect, it } from "vitest";

import { ClaudeCodeAdapter } from "../../packages/agent-adapters/src/claude-code/claude-code-adapter.js";
import {
  assertStagingProviderResult,
  getStagingProviderCredential,
  shouldRunStagingProvider
} from "./real-provider-test-support.js";

const shouldRun = shouldRunStagingProvider("claude-code");

describe.skipIf(!shouldRun)("Claude Code real-provider acceptance", () => {
  it("runs one real Claude Agent SDK turn through the Miaochat adapter", async () => {
    const credential = getStagingProviderCredential("claude-code");
    const adapter = new ClaudeCodeAdapter({
      allowedTools: ["Read", "Glob", "Grep"],
      credentialResolver: async () => credential,
      maxTurns: 1,
      permissionMode: "dontAsk"
    });

    const result = await adapter.execute({
      agentId: "agent_claude_code_real",
      conversationId: "conv_claude_code_real",
      credentialId: "cred_claude_code_real",
      instructions:
        "你是 Miaochat 的 Claude Code 真实接入验收同事。不要修改文件，只用一句中文回答。",
      message: "请回复：Claude Code 已通过真实 SDK 接入。",
      provider: "claude-code",
      workspaceId: "workspace_claude_code_real"
    });

    assertStagingProviderResult(result);
    expect(result.finalContent).toContain("Claude");
  });
});
