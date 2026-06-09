import { type ClientConfig, Client } from "pg";

import { decryptCredentialSecret } from "@agenthub/domain";

import type { PreparedDeployRecord } from "./deploy-types.js";

type DeploySecretRow = {
  encrypted_secret: string | null;
};

export async function resolveDeployTargetSecret(input: {
  envFallbackName: string;
  prepared: PreparedDeployRecord;
}): Promise<string> {
  const envFallback = process.env[input.envFallbackName];
  if (envFallback) {
    return envFallback;
  }

  if (input.prepared.credentialSource === "user_provided" && !input.prepared.hasSecret) {
    throw new Error(`Deploy target ${input.prepared.targetName} is missing a stored secret.`);
  }

  return withDatabase(async (client) => {
    const result = await client.query<DeploySecretRow>(
      `
        SELECT encrypted_secret
        FROM deploy_targets
        WHERE id = $1 AND workspace_id = $2 AND owner_user_id = $3
      `,
      [
        input.prepared.deployTargetId,
        input.prepared.workspaceId,
        input.prepared.ownerUserId
      ]
    );
    const encryptedSecret = result.rows[0]?.encrypted_secret;

    if (!encryptedSecret) {
      throw new Error(`Deploy target ${input.prepared.targetName} has no deploy secret.`);
    }

    return decryptCredentialSecret(
      encryptedSecret,
      process.env.CREDENTIAL_ENCRYPTION_KEY ?? "agenthub-dev-credential-key"
    );
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
