import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  clientEndMock,
  clientQueryMock,
  clientConnectMock,
  createAgentAdapterMock,
  decryptCredentialSecretMock
} = vi.hoisted(() => ({
  clientConnectMock: vi.fn(async () => undefined),
  clientEndMock: vi.fn(async () => undefined),
  clientQueryMock: vi.fn(),
  createAgentAdapterMock: vi.fn(),
  decryptCredentialSecretMock: vi.fn()
}));

vi.mock("pg", () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: clientConnectMock,
    end: clientEndMock,
    query: clientQueryMock
  }))
}));

vi.mock("@agenthub/agent-adapters", () => ({
  createAgentAdapter: createAgentAdapterMock
}));

vi.mock("@agenthub/domain", () => ({
  decryptCredentialSecret: decryptCredentialSecretMock
}));

describe("createPhaseARuntimeExecution", () => {
  beforeEach(() => {
    clientConnectMock.mockClear();
    clientEndMock.mockClear();
    clientQueryMock.mockReset();
    createAgentAdapterMock.mockReset();
    decryptCredentialSecretMock.mockReset();
    decryptCredentialSecretMock.mockReturnValue("decrypted_secret");
    createAgentAdapterMock.mockReturnValue({
      execute: vi.fn(),
      provider: "opencode"
    });
    vi.resetModules();
  });

  it("routes legacy DeepSeek agents through the OpenCode adapter while reusing their credential", async () => {
    clientQueryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            encrypted_secret: "encrypted_secret",
            id: "cred_legacy_deepseek",
            provider: "deepseek",
            provider_account_id: "deepseek-chat",
            workspace_id: "workspace_1"
          }
        ]
      });

    const { createPhaseARuntimeExecution } = await import(
      "../src/activities/provider-runtime.js"
    );
    const execution = await createPhaseARuntimeExecution({
      executionMode: "direct",
      ownerUserId: "user_1",
      provider: "deepseek",
      workspaceId: "workspace_1"
    });

    expect(execution.provider).toBe("opencode");
    expect(execution.credentialId).toBe("cred_legacy_deepseek");
    expect(clientQueryMock).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      ["user_1", "workspace_1", "opencode"]
    );
    expect(clientQueryMock).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      ["user_1", "workspace_1"]
    );
    expect(createAgentAdapterMock).toHaveBeenCalledWith(
      expect.objectContaining({
        executionMode: "direct",
        provider: "opencode"
      })
    );

    const adapterInput = createAgentAdapterMock.mock.calls[0]?.[0] as {
      streamingClientOptions: {
        credentialResolver: (input: {
          credentialId: string;
          workspaceId: string;
        }) => Promise<{ providerAccountId: string; secret: string }>;
      };
    };
    await expect(
      adapterInput.streamingClientOptions.credentialResolver({
        credentialId: "cred_legacy_deepseek",
        workspaceId: "workspace_1"
      })
    ).resolves.toEqual({
      providerAccountId: "deepseek/deepseek-chat",
      secret: "decrypted_secret"
    });
  });

  it("uses a contact-bound credential id before falling back to the latest provider credential", async () => {
    clientQueryMock.mockResolvedValueOnce({
      rows: [
        {
          encrypted_secret: "encrypted_bound_secret",
          id: "11111111-1111-4111-8111-111111111111",
          provider: "opencode",
          provider_account_id: "qwen/qwen3-coder-plus",
          workspace_id: "workspace_1"
        }
      ]
    });

    const { createPhaseARuntimeExecution } = await import(
      "../src/activities/provider-runtime.js"
    );
    const execution = await createPhaseARuntimeExecution({
      credentialId: "11111111-1111-4111-8111-111111111111",
      executionMode: "direct",
      ownerUserId: "user_1",
      provider: "opencode",
      workspaceId: "workspace_1"
    });

    expect(execution.provider).toBe("opencode");
    expect(execution.credentialId).toBe("11111111-1111-4111-8111-111111111111");
    expect(clientQueryMock).toHaveBeenCalledTimes(1);
    expect(clientQueryMock).toHaveBeenCalledWith(
      expect.stringContaining("provider::text = ANY($4::text[])"),
      [
        "11111111-1111-4111-8111-111111111111",
        "user_1",
        "workspace_1",
        ["opencode", "deepseek"]
      ]
    );

    const adapterInput = createAgentAdapterMock.mock.calls[0]?.[0] as {
      streamingClientOptions: {
        credentialResolver: (input: {
          credentialId: string;
          workspaceId: string;
        }) => Promise<{ providerAccountId: string; secret: string }>;
      };
    };
    await expect(
      adapterInput.streamingClientOptions.credentialResolver({
        credentialId: "11111111-1111-4111-8111-111111111111",
        workspaceId: "workspace_1"
      })
    ).resolves.toEqual({
      providerAccountId: "qwen/qwen3-coder-plus",
      secret: "decrypted_secret"
    });
  });
});
