import { randomUUID } from "node:crypto";

import {
  Inject,
  Injectable,
  NotFoundException,
  type OnModuleDestroy
} from "@nestjs/common";

import {
  artifactSchema,
  deployCommandInputSchema,
  deployCommandResultSchema,
  deploymentSchema,
  type Artifact,
  type DeployCommandResult,
  type DeployTargetSummary
} from "@agenthub/contracts";
import { Client, Connection } from "@temporalio/client";

import { DatabaseService } from "../database/database.service.js";
import { PreviewUrlService } from "./preview-url.service.js";

type ArtifactRow = {
  created_at: Date;
  id: string;
  kind: Artifact["kind"];
  message_id: string;
  mime_type: string;
  preview_url: string | null;
  storage_key: string | null;
  title: string;
  workspace_id: string;
};

type DeployTargetSummaryRow = {
  credential_source: DeployTargetSummary["credentialSource"];
  encrypted_secret: string | null;
  id: string;
  kind: DeployTargetSummary["kind"];
  name: string;
  workspace_id: string;
};

@Injectable()
export class DeployDispatchService implements OnModuleDestroy {
  private connection: Connection | null = null;
  private temporalClient: Client | null = null;

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(PreviewUrlService)
    private readonly previewUrlService: PreviewUrlService
  ) {}

  async onModuleDestroy(): Promise<void> {
    await this.connection?.close();
  }

  async dispatch(input: unknown, ownerUserId: string): Promise<DeployCommandResult> {
    const parsed = deployCommandInputSchema.parse(input);
    const artifact = await this.loadLatestConversationArtifact(
      parsed.conversationId,
      parsed.workspaceId,
      ownerUserId
    );
    const target = await this.loadTarget(parsed.targetName, parsed.workspaceId, ownerUserId);
    const client = await this.getTemporalClient();
    const deployment = deploymentSchema.parse(
      await client.workflow.execute("deployArtifactWorkflow", {
        args: [
          {
            artifactId: artifact.id,
            deployTargetId: target.id,
            ownerUserId,
            workspaceId: parsed.workspaceId
          }
        ],
        taskQueue: process.env.WORKER_TASK_QUEUE ?? "agenthub-default",
        workflowId: `deploy:${artifact.id}:${randomUUID()}`
      })
    );
    const deploymentWithPreview =
      await this.previewUrlService.ensureProvisioned(deployment);

    return deployCommandResultSchema.parse({
      artifact,
      deployment: deploymentWithPreview,
      target
    });
  }

  private async loadLatestConversationArtifact(
    conversationId: string,
    workspaceId: string,
    ownerUserId: string
  ): Promise<Artifact> {
    const result = await this.database.query<ArtifactRow>(
      `
        SELECT
          artifacts.created_at,
          artifacts.id,
          artifacts.kind,
          artifacts.message_id,
          artifacts.mime_type,
          artifacts.preview_url,
          artifacts.storage_key,
          artifacts.title,
          artifacts.workspace_id
        FROM artifacts
        INNER JOIN messages
          ON messages.id = artifacts.message_id
          AND messages.workspace_id = artifacts.workspace_id
        WHERE messages.conversation_id = $1
          AND messages.workspace_id = $2
          AND messages.owner_user_id = $3
        ORDER BY messages.created_at DESC, artifacts.created_at DESC, artifacts.id DESC
        LIMIT 1
      `,
      [conversationId, workspaceId, ownerUserId]
    );

    if (!result.rows[0]) {
      throw new NotFoundException(
        `No artifact was found for conversation ${conversationId} in workspace ${workspaceId}.`
      );
    }

    return mapArtifactRow(result.rows[0]);
  }

  private async loadTarget(
    targetName: string,
    workspaceId: string,
    ownerUserId: string
  ): Promise<DeployTargetSummary> {
    const result = await this.database.query<DeployTargetSummaryRow>(
      `
        SELECT
          credential_source,
          encrypted_secret,
          id,
          kind,
          name,
          workspace_id
        FROM deploy_targets
        WHERE name = $1
          AND workspace_id = $2
          AND owner_user_id = $3
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `,
      [targetName, workspaceId, ownerUserId]
    );

    if (!result.rows[0]) {
      throw new NotFoundException(
        `Deploy target "${targetName}" was not found in workspace ${workspaceId}.`
      );
    }

    return mapDeployTargetSummaryRow(result.rows[0]);
  }

  private async getTemporalClient(): Promise<Client> {
    if (this.temporalClient) {
      return this.temporalClient;
    }

    this.connection = await Connection.connect({
      address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233"
    });
    this.temporalClient = new Client({
      connection: this.connection
    });

    return this.temporalClient;
  }
}

function mapArtifactRow(row: ArtifactRow): Artifact {
  return artifactSchema.parse({
    createdAt: row.created_at,
    id: row.id,
    kind: row.kind,
    messageId: row.message_id,
    mimeType: row.mime_type,
    previewUrl: row.preview_url,
    storageKey: row.storage_key,
    title: row.title,
    workspaceId: row.workspace_id
  });
}

function mapDeployTargetSummaryRow(row: DeployTargetSummaryRow): DeployTargetSummary {
  return {
    credentialSource: row.credential_source,
    hasSecret: row.encrypted_secret !== null,
    id: row.id,
    kind: row.kind,
    name: row.name,
    workspaceId: row.workspace_id
  };
}
