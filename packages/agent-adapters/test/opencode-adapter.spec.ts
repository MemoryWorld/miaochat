import { describe, expect, it } from "vitest";

import { OpenCodeAdapter } from "../src/opencode/opencode-adapter.js";
import type {
  OpenCodeClientFactory,
  OpenCodeRuntimeLike
} from "../src/opencode/opencode-types.js";

const credentialResolver = async () => ({
  providerAccountId: "anthropic/claude-sonnet-test",
  secret: "opencode_secret_123"
});

describe("OpenCodeAdapter", () => {
  it("runs OpenCode through the SDK and passes pinned plus recent context", async () => {
    const calls: Array<{ method: string; options?: unknown }> = [];
    const clientFactory: OpenCodeClientFactory = async (): Promise<OpenCodeRuntimeLike> => ({
      client: {
        auth: {
          set: async (options) => {
            calls.push({ method: "auth.set", options });
            return { data: true };
          }
        },
        session: {
          create: async (options) => {
            calls.push({ method: "session.create", options });
            return { data: { id: "session_1" } };
          },
          prompt: async (options) => {
            calls.push({ method: "session.prompt", options });
            return {
              data: {
                info: {
                  id: "assistant_1",
                  role: "assistant"
                },
                parts: [
                  {
                    text: "OpenCode result",
                    type: "text"
                  }
                ]
              }
            };
          }
        }
      },
      server: {
        close: () => undefined
      }
    });
    const adapter = new OpenCodeAdapter({
      clientFactory,
      credentialResolver,
      cwd: "/tmp/miaochat-opencode",
      workspaceSandboxEnabled: false
    });

    const result = await adapter.execute({
      agentId: "agent_opencode",
      context: {
        pinnedMessages: [{ content: "Use accessibility.", id: "pin_1", role: "user" }],
        recentMessages: [{ content: "Previous plan.", id: "msg_1", role: "assistant" }]
      },
      conversationId: "conv_opencode",
      credentialId: "cred_opencode",
      instructions: "你是软件工程师。",
      message: "Build the page",
      modelProfileId: "openai/gpt-test",
      provider: "opencode",
      workspaceId: "workspace_opencode"
    });

    expect(result.finalContent).toBe("OpenCode result");
    expect(result.streamEvents.map((event) => event.kind)).toEqual([
      "conversation.message.started",
      "conversation.message.delta",
      "conversation.message.completed"
    ]);
    expect(calls[0]).toMatchObject({
      method: "auth.set",
      options: {
        body: {
          key: "opencode_secret_123",
          type: "api"
        },
        path: { id: "anthropic" }
      }
    });
    expect(calls[2]).toMatchObject({
      method: "session.prompt",
      options: {
        body: {
          model: {
            modelID: "gpt-test",
            providerID: "openai"
          },
          system: "你是软件工程师。"
        }
      }
    });
    expect(JSON.stringify(calls[2]?.options)).toContain("Use accessibility.");
    expect(JSON.stringify(calls[2]?.options)).toContain("Previous plan.");
    expect(JSON.stringify(calls[2]?.options)).toContain("Build the page");
  });

  it("uses the configured OpenCode model when custom agents pass a preset profile id", async () => {
    const calls: Array<{ method: string; options?: unknown }> = [];
    const clientFactory: OpenCodeClientFactory = async (): Promise<OpenCodeRuntimeLike> => ({
      client: {
        auth: {
          set: async (options) => {
            calls.push({ method: "auth.set", options });
            return { data: true };
          }
        },
        session: {
          create: async (options) => {
            calls.push({ method: "session.create", options });
            return { data: { id: "session_1" } };
          },
          prompt: async (options) => {
            calls.push({ method: "session.prompt", options });
            return {
              data: {
                parts: [{ text: "OpenCode result", type: "text" }]
              }
            };
          }
        }
      }
    });
    const adapter = new OpenCodeAdapter({
      clientFactory,
      credentialResolver,
      model: "anthropic/claude-from-env",
      workspaceSandboxEnabled: false
    });

    await adapter.execute({
      agentId: "agent_opencode",
      conversationId: "conv_opencode",
      credentialId: "cred_opencode",
      message: "Build the page",
      modelProfileId: "balanced",
      provider: "opencode",
      workspaceId: "workspace_opencode"
    });

    expect(calls[2]).toMatchObject({
      method: "session.prompt",
      options: {
        body: {
          model: {
            modelID: "claude-from-env",
            providerID: "anthropic"
          }
        }
      }
    });
  });

  it("rejects requests without a BYOK credentialId", async () => {
    const adapter = new OpenCodeAdapter({
      clientFactory: async () => {
        throw new Error("unused");
      },
      credentialResolver
    });

    await expect(
      adapter.execute({
        agentId: "agent_opencode",
        conversationId: "conv_opencode",
        message: "hi",
        provider: "opencode",
        workspaceId: "workspace_opencode"
      })
    ).rejects.toThrow(/OpenCode API Key/);
  });
});
