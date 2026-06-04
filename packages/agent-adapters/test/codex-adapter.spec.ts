import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { CodexAdapter } from "../src/codex/codex-adapter.js";
import type {
  CodexClientFactory,
  CodexSdkClientOptions,
  CodexThreadEvent,
  CodexThreadOptions
} from "../src/codex/codex-types.js";

const execFileAsync = promisify(execFile);
const tempDirectories: string[] = [];

const credentialResolver = async () => ({
  providerAccountId: "acct_codex",
  secret: "sk-codex-test-123"
});

describe("CodexAdapter", () => {
  afterEach(async () => {
    for (const directory of tempDirectories.splice(0)) {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("runs Codex through the official SDK and normalizes streamed agent messages", async () => {
    const calls: Array<{
      input: string;
      options?: CodexSdkClientOptions;
      threadOptions?: CodexThreadOptions;
    }> = [];
    const clientFactory: CodexClientFactory = (options) => ({
      startThread: (threadOptions) => ({
        runStreamed: async (input) => {
          calls.push({ input, options, threadOptions });

          return {
            events: streamCodexEvents([
              {
                thread_id: "thread_1",
                type: "thread.started"
              },
              {
                item: {
                  id: "item_1",
                  text: "Hello from Codex",
                  type: "agent_message"
                },
                type: "item.completed"
              },
              {
                type: "turn.completed",
                usage: {
                  cached_input_tokens: 0,
                  input_tokens: 10,
                  output_tokens: 3,
                  reasoning_output_tokens: 1
                }
              }
            ])
          };
        }
      })
    });
    const adapter = new CodexAdapter({
      clientFactory,
      credentialResolver,
      cwd: "/tmp/miaochat-codex",
      env: { CODEX_HOME: "/tmp/miaochat-codex-home" },
      model: "gpt-5.3-codex",
      networkAccessEnabled: false,
      sandbox: "workspace-write",
      workspaceSandboxEnabled: false
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
    expect(calls).toHaveLength(1);
    expect(calls[0]?.options).toEqual(
      expect.objectContaining({
        apiKey: "sk-codex-test-123",
        env: expect.objectContaining({ CODEX_HOME: "/tmp/miaochat-codex-home" })
      })
    );
    expect(calls[0]?.threadOptions).toEqual(
      expect.objectContaining({
        approvalPolicy: "never",
        model: "gpt-5.3-codex",
        networkAccessEnabled: false,
        sandboxMode: "workspace-write",
        workingDirectory: "/tmp/miaochat-codex"
      })
    );
    expect(calls[0]?.input).toContain("Prefer small diffs.");
    expect(calls[0]?.input).toContain("Build the slice");
  });

  it("runs Codex inside a temporary workspace sandbox and returns its diff artifact", async () => {
    const cwd = await createGitRepo();
    const calls: Array<{ threadOptions?: CodexThreadOptions }> = [];
    const clientFactory: CodexClientFactory = () => ({
      startThread: (threadOptions) => ({
        runStreamed: async () => {
          calls.push({ threadOptions });
          const workingDirectory = threadOptions?.workingDirectory;

          if (!workingDirectory) {
            throw new Error("missing workingDirectory");
          }

          await writeFile(
            join(workingDirectory, "app.ts"),
            "export const value = sandboxed;\n",
            "utf8"
          );

          return {
            events: streamCodexEvents([
              {
                item: {
                  id: "item_sandbox",
                  text: "Sandboxed change ready",
                  type: "agent_message"
                },
                type: "item.completed"
              }
            ])
          };
        }
      })
    });
    const adapter = new CodexAdapter({
      clientFactory,
      credentialResolver,
      cwd
    });

    const result = await adapter.execute({
      agentId: "agent_codex",
      conversationId: "conv_codex_sandbox",
      credentialId: "cred_codex",
      message: "Edit app.ts",
      provider: "codex",
      workspaceId: "workspace_codex"
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.threadOptions?.workingDirectory).not.toBe(cwd);
    await expect(readFile(join(cwd, "app.ts"), "utf8")).resolves.toBe(
      "export const value = source;\n"
    );
    expect(result.finalContent).toBe("Sandboxed change ready");
    expect(result.runtimeMetadata?.workspaceSandbox).toEqual(
      expect.objectContaining({
        provider: "codex",
        strategy: "git_worktree"
      })
    );
    expect(result.artifacts?.[0]).toEqual(
      expect.objectContaining({
        fileName: "codex-runtime.diff",
        type: "diff"
      })
    );
    expect(result.artifacts?.[0]?.patch).toContain("+export const value = sandboxed;");
  });

  it("rejects requests without a BYOK credentialId", async () => {
    const adapter = new CodexAdapter({
      clientFactory: () => ({
        startThread: () => ({
          runStreamed: async () => ({ events: streamCodexEvents([]) })
        })
      }),
      credentialResolver,
      workspaceSandboxEnabled: false
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

  it("translates missing SDK runtime failures into missing_runtime adapter errors", async () => {
    const adapter = new CodexAdapter({
      clientFactory: () => ({
        startThread: () => ({
          runStreamed: async () => {
            throw new Error("spawn codex ENOENT");
          }
        })
      }),
      credentialResolver,
      workspaceSandboxEnabled: false
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

  it("translates streamed SDK failures into provider_failed adapter errors", async () => {
    const adapter = new CodexAdapter({
      clientFactory: () => ({
        startThread: () => ({
          runStreamed: async () => ({
            events: streamCodexEvents([
              {
                error: { message: "temporary upstream timeout" },
                type: "turn.failed"
              }
            ])
          })
        })
      }),
      credentialResolver,
      workspaceSandboxEnabled: false
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
    ).rejects.toMatchObject({ code: "provider_failed", retryable: true });
  });
});

async function* streamCodexEvents(
  events: CodexThreadEvent[]
): AsyncGenerator<CodexThreadEvent> {
  for (const event of events) {
    yield event;
  }
}

async function createGitRepo(): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), "miaochat-codex-adapter-"));
  tempDirectories.push(cwd);

  await git(cwd, "init");
  await git(cwd, "config", "user.email", "miaochat@example.com");
  await git(cwd, "config", "user.name", "Miaochat Test");
  await writeFile(join(cwd, "app.ts"), "export const value = source;\n", "utf8");
  await git(cwd, "add", "app.ts");
  await git(cwd, "commit", "-m", "initial");
  return cwd;
}

async function git(cwd: string, ...args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd });
}
