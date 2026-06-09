import { randomUUID } from "node:crypto";

import { type ClientConfig, Client } from "pg";

import {
  deploymentSchema,
  type CredentialSource,
  type Deployment,
  type DeploymentProgressEvent,
  type DeploymentStatus,
  type DeployTargetKind
} from "@agenthub/contracts";

import type { PreparedDeployRecord } from "./deploy-types.js";

type PrepareDeployActivityInput = {
  artifactId: string;
  deployTargetId: string;
  initialProgressEvent: DeploymentProgressEvent;
  ownerUserId: string;
  workspaceId: string;
};

type FinalizeDeployActivityInput = {
  deploymentId: string;
  errorMessage: string | null;
  ownerUserId: string;
  previewUrl: string | null;
  progressEvents: DeploymentProgressEvent[];
  resultMessage: string;
  status: DeploymentStatus;
  workspaceId: string;
};

type DeploymentRow = {
  artifact_id: string;
  completed_at: Date | null;
  created_at: Date;
  deploy_target_id: string;
  error_message: string | null;
  id: string;
  owner_user_id: string;
  preview_url: string | null;
  progress_events: DeploymentProgressEvent[];
  result_message: string;
  started_at: Date;
  status: Deployment["status"];
  target_kind: Deployment["targetKind"];
  updated_at: Date;
  workspace_id: string;
};

type PreparedDeployRow = {
  artifact_id: string;
  artifact_storage_key: string | null;
  artifact_title: string;
  config: Record<string, unknown> | null;
  credential_source: CredentialSource;
  encrypted_secret: string | null;
  target_kind: DeployTargetKind;
  target_name: string;
};

export async function prepareDeployActivity(
  input: PrepareDeployActivityInput
): Promise<PreparedDeployRecord> {
  return withDatabase(async (client) => {
    const prepared = await client.query<PreparedDeployRow>(
      `
        SELECT
          artifacts.id AS artifact_id,
          artifacts.storage_key AS artifact_storage_key,
          artifacts.title AS artifact_title,
          deploy_targets.config,
          deploy_targets.credential_source,
          deploy_targets.encrypted_secret,
          deploy_targets.kind AS target_kind,
          deploy_targets.name AS target_name
        FROM artifacts
        INNER JOIN deploy_targets
          ON deploy_targets.workspace_id = artifacts.workspace_id
        WHERE artifacts.id = $1
          AND artifacts.workspace_id = $2
          AND deploy_targets.id = $3
          AND deploy_targets.owner_user_id = $4
          AND deploy_targets.workspace_id = $2
      `,
      [input.artifactId, input.workspaceId, input.deployTargetId, input.ownerUserId]
    );

    const row = prepared.rows[0];
    if (!row) {
      throw new Error(
        `Deploy target ${input.deployTargetId} or artifact ${input.artifactId} was not found in workspace ${input.workspaceId}.`
      );
    }

    const deploymentId = randomUUID();

    await client.query(
      `
        INSERT INTO deployments (
          id,
          artifact_id,
          deploy_target_id,
          owner_user_id,
          workspace_id,
          target_kind,
          status,
          result_message,
          progress_events
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'queued', 'Deployment queued.', $7::jsonb)
      `,
      [
        deploymentId,
        input.artifactId,
        input.deployTargetId,
        input.ownerUserId,
        input.workspaceId,
        row.target_kind,
        JSON.stringify([input.initialProgressEvent])
      ]
    );

    return {
      artifactId: row.artifact_id,
      artifactStorageKey: row.artifact_storage_key,
      artifactTitle: row.artifact_title,
      config: row.config ?? {},
      credentialSource: row.credential_source,
      deployTargetId: input.deployTargetId,
      deploymentId,
      hasSecret: row.encrypted_secret !== null,
      ownerUserId: input.ownerUserId,
      targetKind: row.target_kind,
      targetName: row.target_name,
      workspaceId: input.workspaceId
    };
  });
}

export async function finalizeDeployActivity(
  input: FinalizeDeployActivityInput
): Promise<Deployment> {
  return withDatabase(async (client) => {
    const result = await client.query<DeploymentRow>(
      `
        WITH next_status AS (
          SELECT $4::deployment_status AS value
        )
        UPDATE deployments
        SET
          status = next_status.value,
          result_message = $5,
          error_message = $6,
          preview_url = $7,
          progress_events = $8::jsonb,
          completed_at = CASE
            WHEN next_status.value IN (
              'succeeded'::deployment_status,
              'failed'::deployment_status
            ) THEN now()
            ELSE completed_at
          END,
          updated_at = now()
        FROM next_status
        WHERE id = $1
          AND owner_user_id = $2
          AND workspace_id = $3
        RETURNING
          artifact_id,
          completed_at,
          created_at,
          deploy_target_id,
          error_message,
          id,
          owner_user_id,
          preview_url,
          progress_events,
          result_message,
          started_at,
          status,
          target_kind,
          updated_at,
          workspace_id
      `,
      [
        input.deploymentId,
        input.ownerUserId,
        input.workspaceId,
        input.status,
        input.resultMessage,
        input.errorMessage,
        input.previewUrl,
        JSON.stringify(input.progressEvents)
      ]
    );

    return mapDeploymentRow(result.rows[0]);
  });
}

function mapDeploymentRow(row: DeploymentRow | undefined): Deployment {
  if (!row) {
    throw new Error("Deployment row not found");
  }

  return deploymentSchema.parse({
    artifactId: row.artifact_id,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    deployTargetId: row.deploy_target_id,
    errorMessage: row.error_message,
    id: row.id,
    ownerUserId: row.owner_user_id,
    previewUrl: row.preview_url,
    progressEvents: row.progress_events ?? [],
    resultMessage: row.result_message,
    startedAt: row.started_at,
    status: row.status,
    targetKind: row.target_kind,
    updatedAt: row.updated_at,
    workspaceId: row.workspace_id
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
