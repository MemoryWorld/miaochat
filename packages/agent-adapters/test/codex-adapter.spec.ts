import { describe, expect, it } from "vitest";

import { CodexAdapter } from "../src/codex/codex-adapter.js";
import type { CodexCommandInput } from "../src/codex/codex-types.js";

const credentialResolver = async () => ({
  providerAccountId: "acct_codex",
  secret: "sk-codex-test-123"
});

describe("CodexAdapter", () => {
  it("runs codex exec --json and normalizes agent message events", async () => {
    const commandLog: CodexCommandInput[] = [];
    const adapter = new CodexAdapter({
      credentialResolver,
      cwd: "/tmp/miaochat-codex",
      executable: "/usr/local/bin/codex",
      model: "gpt-5.3-codex",
      runner: async (input) => {
        commandLog.push(input);
        return {
          exitCode: 0,
          stderr: "",
          stdout: [
            JSON.stringify({
              thread_id: "thread_1",
              type: "thread.started"
            }),
            JSON.stringify({
              item: {
                text: "Hello from Codex",
                type: "agent_message"
              },
              type: "item.completed"
            }),
            JSON.stringify({
              type: "turn.completed",
              usage: { input_tokens: 10, output_tokens: 3 }
            })
          ].join("\n")
        };
      }
    });
    const result = await adapter.execute({
      agentId: "agent_codex",
      context: {
        pinnedMessages: [{ content: "Prefer small diffs.", id: "pin_1", role: "user" }]
      },
      conversationId: "conv_codex",
      credentialId: "cred_codex",
      instructions: "你是实现 AI 同事。",
      message: "Build the slice",
      provider: "codex",
      workspaceId: "workspace_codex"
    });

    expect(result.finalContent).toBe("Hello from Codex");
    expect(result.streamEvents.map((event) => event.kind)).toEqual([
      "conversation.message.started",
      "conversation.message.delta",
      "conversation.message.completed"
    ]);
    expect(commandLog).toHaveLength(1);
    expect(commandLog[0]?.command).toBe("/usr/local/bin/codex");
    expect(commandLog[0]?.args).toEqual([
      "exec",
      "--json",
      "--ephemeral",
      "--sandbox",
      "workspace-write",
      "--ask-for-approval",
      "never",
      "--model",
      "gpt-5.3-codex",
      "-"
    ]);
    expect(commandLog[0]?.cwd).toBe("/tmp/miaochat-codex");
    expect(commandLog[0]?.env.CODEX_API_KEY).toBe("sk-codex-test-123");
    expect(commandLog[0]?.stdin).toContain("Prefer small diffs.");
    expect(commandLog[0]?.stdin).toContain("Build the slice");
  });

  it("rejects requests without a BYOK credentialId", async () => {
    const adapter = new CodexAdapter({
      credentialResolver,
      runner: async () => ({ exitCode: 0, stderr: "", stdout: "" })
    });

    await expect(
      adapter.execute({
        agentId: "agent_codex",
        conversationId: "conv_codex",
        message: "hi",
        provider: "codex",
        workspaceId: "workspace_codex"
      })
    ).rejects.toThrow(/Codex API Key/);
  });

  it("translates missing CLI failures into missing_runtime adapter errors", async () => {
    const adapter = new CodexAdapter({
      credentialResolver,
      runner: async () => ({
        exitCode: 127,
        stderr: "spawn codex ENOENT",
        stdout: ""
      })
    });

    await expect(
      adapter.execute({
        agentId: "agent_codex",
        conversationId: "conv_codex",
        credentialId: "cred_codex",
        message: "hi",
        provider: "codex",
        workspaceId: "workspace_codex"
      })
    ).rejects.toMatchObject({ code: "missing_runtime" });
  });
});
