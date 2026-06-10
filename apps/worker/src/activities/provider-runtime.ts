import type { AgentAdapter } from "@agenthub/agent-sdk";
import type { ProviderId } from "@agenthub/contracts";
import { createAgentAdapter, type AgentExecutionMode } from "@agenthub/agent-adapters";
import { decryptCredentialSecret } from "@agenthub/domain";
import { type ClientConfig, Client } from "pg";

import { ProviderCredentialError } from "./activity-errors.js";

type PhaseARuntimeProvider = Extract<
  ProviderId,
  "claude-code" | "codex" | "deepseek" | "hermes" | "mock" | "opencode" | "openclaw"
>;

type RuntimeCredentialRow = {
  encrypted_secret: string;
  id: string;
  provider: Exclude<PhaseARuntimeProvider, "mock">;
  provider_account_id: string;
  workspace_id: string;
};

type RuntimeCredential = {
  id: string;
  providerAccountId: string;
  secret: string;
  workspaceId: string;
};

export type PhaseARuntimeExecution = {
  adapter: AgentAdapter;
  credentialId?: string;
  provider: PhaseARuntimeProvider;
};

export async function createPhaseARuntimeExecution(input: {
  credentialId?: string | null;
  executionMode: AgentExecutionMode;
  ownerUserId: string;
  provider: ProviderId;
  workspaceId: string;
}): Promise<PhaseARuntimeExecution> {
  const requestedProvider = assertPhaseARuntimeProvider(input.provider);
  const provider = resolveExecutableRuntimeProvider(requestedProvider);

  if (provider === "mock") {
    return {
      adapter: createAgentAdapter({
        executionMode: input.executionMode,
        provider
      }),
      provider
    };
  }

  const credential = await selectLatestByokCredential({
    credentialId: input.credentialId,
    ownerUserId: input.ownerUserId,
    provider,
    workspaceId: input.workspaceId
  });

  return {
    adapter: createAgentAdapter({
      executionMode: input.executionMode,
      provider,
      streamingClientOptions: {
        credentialResolver: async ({ credentialId, workspaceId }) => {
          if (credentialId !== credential.id || workspaceId !== credential.workspaceId) {
            throw new Error(
              `Credential ${credentialId} is not available for provider ${provider} in workspace ${workspaceId}.`
            );
          }

          return {
            providerAccountId: credential.providerAccountId,
            secret: credential.secret
          };
        }
      }
    }),
    credentialId: credential.id,
    provider
  };
}

function resolveExecutableRuntimeProvider(provider: PhaseARuntimeProvider): PhaseARuntimeProvider {
  return provider === "deepseek" ? "opencode" : provider;
}

export function assertPhaseARuntimeProvider(provider: ProviderId): PhaseARuntimeProvider {
  switch (provider) {
    case "mock":
    case "claude-code":
    case "codex":
    case "deepseek":
    case "hermes":
    case "opencode":
    case "openclaw":
      return provider;
  }
}

async function selectLatestByokCredential(input: {
  credentialId?: string | null;
  ownerUserId: string;
  provider: Exclude<PhaseARuntimeProvider, "mock">;
  workspaceId: string;
}): Promise<RuntimeCredential> {
  return withDatabase(async (client) => {
    const preferredCredentialId =
      input.credentialId && looksLikeCredentialId(input.credentialId)
        ? input.credentialId
        : null;
    const preferredCredential = preferredCredentialId
      ? await selectPreferredByokCredential(client, {
          credentialId: preferredCredentialId,
          ownerUserId: input.ownerUserId,
          provider: input.provider,
          workspaceId: input.workspaceId
        })
      : null;
    const result = preferredCredential
      ? { rows: [preferredCredential] }
      : await client.query<RuntimeCredentialRow>(
      `
        SELECT
          encrypted_secret,
          id,
          provider,
          provider_account_id,
          workspace_id
        FROM provider_credentials
        WHERE owner_user_id = $1
          AND workspace_id = $2
          AND provider = $3
          AND credential_source = 'user_provided'
          AND validation_state = 'valid'
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `,
      [input.ownerUserId, input.workspaceId, input.provider]
    );

    const row =
      result.rows[0] ??
      (input.provider === "opencode"
        ? await selectLatestLegacyDeepSeekCredential(client, input)
        : null);
    if (!row) {
      throw new ProviderCredentialError(
        `No valid BYOK credential found for provider ${input.provider} in workspace ${input.workspaceId}.`
      );
    }

    return {
      id: row.id,
      providerAccountId: normalizeRuntimeProviderAccountId(row),
      secret: decryptCredentialSecret(
        row.encrypted_secret,
        process.env.CREDENTIAL_ENCRYPTION_KEY ?? "agenthub-dev-credential-key"
      ),
      workspaceId: row.workspace_id
    };
  });
}

async function selectPreferredByokCredential(
  client: Client,
  input: {
    credentialId: string;
    ownerUserId: string;
    provider: Exclude<PhaseARuntimeProvider, "mock">;
    workspaceId: string;
  }
): Promise<RuntimeCredentialRow | null> {
  const allowedProviders =
    input.provider === "opencode" ? ["opencode", "deepseek"] : [input.provider];
  const result = await client.query<RuntimeCredentialRow>(
    `
      SELECT
        encrypted_secret,
        id,
        provider,
        provider_account_id,
        workspace_id
      FROM provider_credentials
      WHERE id = $1
        AND owner_user_id = $2
        AND workspace_id = $3
        AND provider = ANY($4::text[])
        AND credential_source = 'user_provided'
        AND validation_state = 'valid'
      LIMIT 1
    `,
    [input.credentialId, input.ownerUserId, input.workspaceId, allowedProviders]
  );

  return result.rows[0] ?? null;
}

async function selectLatestLegacyDeepSeekCredential(
  client: Client,
  input: {
    ownerUserId: string;
    workspaceId: string;
  }
): Promise<RuntimeCredentialRow | null> {
  const result = await client.query<RuntimeCredentialRow>(
    `
      SELECT
        encrypted_secret,
        id,
        provider,
        provider_account_id,
        workspace_id
      FROM provider_credentials
      WHERE owner_user_id = $1
        AND workspace_id = $2
        AND provider = 'deepseek'
        AND credential_source = 'user_provided'
        AND validation_state = 'valid'
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `,
    [input.ownerUserId, input.workspaceId]
  );

  return result.rows[0] ?? null;
}

function normalizeRuntimeProviderAccountId(row: RuntimeCredentialRow): string {
  if (row.provider !== "deepseek" || row.provider_account_id.includes("/")) {
    return row.provider_account_id;
  }

  return `deepseek/${row.provider_account_id || "deepseek-chat"}`;
}

function looksLikeCredentialId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    value.trim()
  );
}

async function withDatabase<T>(callback: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client(getConnectionConfig());
  await client.connect();

  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}

function getConnectionConfig(): ClientConfig {
  return {
    connectionString:
      process.env.DATABASE_URL ?? "postgres://agenthub:agenthub@localhost:6432/agenthub"
  };
}
