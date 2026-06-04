import { describe, expect, it } from "vitest";

import { CodexAdapter } from "../../packages/agent-adapters/src/codex/codex-adapter.js";
import {
  assertStagingProviderResult,
  getStagingProviderCredential,
  shouldRunStagingProvider
} from "./real-provider-test-support.js";

const shouldRun = shouldRunStagingProvider("codex");

describe.skipIf(!shouldRun)("Codex real-provider acceptance", () => {
  it("runs one real codex exec turn through the Miaochat adapter", async () => {
    const credential = getStagingProviderCredential("codex");
    const adapter = new CodexAdapter({
      credentialResolver: async () => credential,
      executable: process.env.CODEX_EXECUTABLE,
      model: process.env.CODEX_MODEL,
      sandbox: "read-only"
    });

    const result = await adapter.execute({
      agentId: "agent_codex_real",
      conversationId: "conv_codex_real",
      credentialId: "cred_codex_real",
      instructions:
        "你是 Miaochat 的 Codex 真实接入验收同事。不要修改文件，只用一句中文回答。",
      message: "请回复：Codex 已通过真实 CLI 接入。",
      provider: "codex",
      workspaceId: "workspace_codex_real"
    });

    assertStagingProviderResult(result);
    expect(result.finalContent).toContain("Codex");
  });
});
