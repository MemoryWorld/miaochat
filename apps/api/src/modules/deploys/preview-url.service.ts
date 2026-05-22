import { randomUUID } from "node:crypto";

import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";

import { deploymentSchema, type Deployment } from "@agenthub/contracts";

import { DatabaseService } from "../database/database.service.js";

type DeploymentRow = {
  artifact_id: string;
  completed_at: Date | null;
  created_at: Date;
  deploy_target_id: string;
  error_message: string | null;
  id: string;
  owner_user_id: string;
  preview_url: string | null;
  progress_events: Deployment["progressEvents"];
  result_message: string;
  started_at: Date;
  status: Deployment["status"];
  target_kind: Deployment["targetKind"];
  updated_at: Date;
  workspace_id: string;
};

@Injectable()
export class PreviewUrlService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async ensureProvisioned(deployment: Deployment): Promise<Deployment> {
    if (deployment.status !== "succeeded") {
      return deployment;
    }

    if (deployment.targetKind === "source-archive") {
      return deployment;
    }

    if (deployment.previewUrl) {
      return deployment;
    }

    return this.persistPreviewUrl(
      deployment.id,
      deployment.ownerUserId,
      deployment.workspaceId,
      deployment.targetKind
    );
  }

  async rotatePreviewUrl(
    deploymentId: string,
    workspaceId: string,
    ownerUserId: string
  ): Promise<Deployment> {
    const deployment = await this.loadDeployment(deploymentId, workspaceId, ownerUserId);

    if (deployment.targetKind === "source-archive") {
      throw new BadRequestException(
        "Preview URLs are available only for static-site and container deploys."
      );
    }

    return this.persistPreviewUrl(
      deployment.id,
      deployment.ownerUserId,
      deployment.workspaceId,
      deployment.targetKind
    );
  }

  private async loadDeployment(
    deploymentId: string,
    workspaceId: string,
    ownerUserId: string
  ): Promise<Deployment> {
    const result = await this.database.query<DeploymentRow>(
      `
        SELECT
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
        FROM deployments
        WHERE id = $1 AND workspace_id = $2 AND owner_user_id = $3
      `,
      [deploymentId, workspaceId, ownerUserId]
    );

    if (!result.rows[0]) {
      throw new NotFoundException(
        `Deployment ${deploymentId} was not found in workspace ${workspaceId}.`
      );
    }

    return mapDeploymentRow(result.rows[0]);
  }

  private async persistPreviewUrl(
    deploymentId: string,
    ownerUserId: string,
    workspaceId: string,
    targetKind: "container" | "static-site"
  ): Promise<Deployment> {
    const previewUrl = buildPreviewUrl({
      deploymentId,
      targetKind,
      workspaceId
    });

    const result = await this.database.query<DeploymentRow>(
      `
        UPDATE deployments
        SET preview_url = $4, updated_at = now()
        WHERE id = $1 AND owner_user_id = $2 AND workspace_id = $3
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
      [deploymentId, ownerUserId, workspaceId, previewUrl]
    );

    if (!result.rows[0]) {
      throw new NotFoundException(
        `Deployment ${deploymentId} was not found in workspace ${workspaceId}.`
      );
    }

    return mapDeploymentRow(result.rows[0]);
  }
}

function buildPreviewUrl(input: {
  deploymentId: string;
  targetKind: "container" | "static-site";
  workspaceId: string;
}): string {
  const baseUrl = (process.env.PREVIEW_BASE_URL ?? "https://preview.agenthub.local").replace(
    /\/$/,
    ""
  );
  const token = randomUUID().replaceAll("-", "");

  return `${baseUrl}/workspaces/${encodeURIComponent(input.workspaceId)}/${input.targetKind}/${encodeURIComponent(input.deploymentId)}?token=${token}`;
}

function mapDeploymentRow(row: DeploymentRow): Deployment {
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
