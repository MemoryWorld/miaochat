import type { AgentAdapter } from "@agenthub/agent-sdk";
import type { ProviderId } from "@agenthub/contracts";
import { createAgentAdapter, type AgentExecutionMode } from "@agenthub/agent-adapters";
import { decryptCredentialSecret } from "@agenthub/domain";
import { type ClientConfig, Client } from "pg";

type PhaseARuntimeProvider = Extract<ProviderId, "deepseek" | "hermes" | "mock" | "openclaw">;

type RuntimeCredentialRow = {
  encrypted_secret: string;
  id: string;
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
  executionMode: AgentExecutionMode;
  ownerUserId: string;
  provider: ProviderId;
  workspaceId: string;
}): Promise<PhaseARuntimeExecution> {
  const provider = assertPhaseARuntimeProvider(input.provider);

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

export function assertPhaseARuntimeProvider(provider: ProviderId): PhaseARuntimeProvider {
  switch (provider) {
    case "mock":
    case "deepseek":
    case "hermes":
    case "openclaw":
      return provider;
    case "codex":
    case "claude-code":
      throw new Error(
        `Provider ${provider} is outside the current AI colleague runtime baseline.`
      );
  }
}

async function selectLatestByokCredential(input: {
  ownerUserId: string;
  provider: Exclude<PhaseARuntimeProvider, "mock">;
  workspaceId: string;
}): Promise<RuntimeCredential> {
  return withDatabase(async (client) => {
    const result = await client.query<RuntimeCredentialRow>(
      `
        SELECT
          encrypted_secret,
          id,
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

    const row = result.rows[0];
    if (!row) {
      throw new Error(
        `No valid BYOK credential found for provider ${input.provider} in workspace ${input.workspaceId}.`
      );
    }

    return {
      id: row.id,
      providerAccountId: row.provider_account_id,
      secret: decryptCredentialSecret(
        row.encrypted_secret,
        process.env.CREDENTIAL_ENCRYPTION_KEY ?? "agenthub-dev-credential-key"
      ),
      workspaceId: row.workspace_id
    };
  });
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
