import { describe, expect, it } from "vitest";

import type { ProviderCredential } from "@agenthub/contracts";

import { CredentialService } from "../src";

class InMemoryCredentialRepository {
  private readonly items = new Map<string, ProviderCredential>();

  async create(credential: ProviderCredential): Promise<ProviderCredential> {
    this.items.set(credential.id, credential);
    return credential;
  }

  async findById(id: string): Promise<ProviderCredential | null> {
    return this.items.get(id) ?? null;
  }

  async listByWorkspace(workspaceId: string): Promise<ProviderCredential[]> {
    return [...this.items.values()].filter(
      (credential) => credential.workspaceId === workspaceId
    );
  }

  async revoke(id: string, workspaceId: string): Promise<boolean> {
    const credential = this.items.get(id);
    if (!credential || credential.workspaceId !== workspaceId) {
      return false;
    }

    this.items.delete(id);
    return true;
  }
}

describe("@agenthub/domain credential service", () => {
  it("stores BYOK secrets encrypted and can reveal them later", async () => {
    const repository = new InMemoryCredentialRepository();
    const service = new CredentialService(
      repository,
      async (input) => ({
        providerAccountId: input.providerAccountId,
        valid: true
      }),
      "test-encryption-key"
    );

    const credential = await service.create({
      label: "Hermes prod",
      provider: "hermes",
      providerAccountId: "acct_1",
      rawSecret: "secret_123",
      workspaceId: "workspace_1"
    });

    expect(credential.encryptedSecret).not.toContain("secret_123");
    await expect(service.revealSecret(credential.id)).resolves.toBe("secret_123");
    expect(credential.credentialSource).toBe("user_provided");
  });

  it("lists and revokes credentials within a workspace", async () => {
    const repository = new InMemoryCredentialRepository();
    const service = new CredentialService(
      repository,
      async (input) => ({
        providerAccountId: input.providerAccountId,
        valid: true
      }),
      "test-encryption-key"
    );

    const first = await service.create({
      label: "Codex",
      provider: "codex",
      providerAccountId: "acct_codex",
      rawSecret: "sk-codex-123",
      workspaceId: "workspace_1"
    });
    await service.create({
      label: "Claude",
      provider: "claude-code",
      providerAccountId: "acct_claude",
      rawSecret: "sk-ant-123",
      workspaceId: "workspace_2"
    });

    await expect(service.list("workspace_1")).resolves.toEqual([first]);
    await expect(service.revoke(first.id, "workspace_1")).resolves.toBe(true);
    await expect(service.list("workspace_1")).resolves.toEqual([]);
  });
});
