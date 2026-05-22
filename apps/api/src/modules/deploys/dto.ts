import type {
  DeployCommandInput as SharedDeployCommandInput,
  DeployCommandResult as SharedDeployCommandResult,
  CreateDeployTargetInput,
  DeployTarget
} from "@agenthub/contracts";
import {
  deployCommandInputSchema,
  createDeployTargetInputSchema,
  deployTargetSchema
} from "@agenthub/contracts";
import { z } from "zod";

export const deployTargetMetadataSchema = deployTargetSchema
  .omit({
    encryptedSecret: true
  })
  .extend({
    hasSecret: z.boolean()
  });

export const deployTargetWorkspaceQuerySchema = z.object({
  workspaceId: z.string().trim().min(1).default("default-workspace")
});

export type DeployTargetCreateInput = CreateDeployTargetInput;
export type DeployCommandInput = SharedDeployCommandInput;
export type DeployCommandResult = SharedDeployCommandResult;
export type DeployTargetMetadata = z.infer<typeof deployTargetMetadataSchema>;
export type DeployTargetWorkspaceQuery = z.infer<
  typeof deployTargetWorkspaceQuerySchema
>;

export function parseDeployCommandInput(input: unknown): DeployCommandInput {
  return deployCommandInputSchema.parse(input);
}

export function parseDeployTargetCreateInput(input: unknown): DeployTargetCreateInput {
  return createDeployTargetInputSchema.parse(input);
}

export function parseDeployTargetWorkspaceQuery(
  input: unknown
): DeployTargetWorkspaceQuery {
  return deployTargetWorkspaceQuerySchema.parse(input);
}

export function toDeployTargetMetadata(target: DeployTarget): DeployTargetMetadata {
  return deployTargetMetadataSchema.parse({
    config: target.config,
    createdAt: target.createdAt,
    credentialSource: target.credentialSource,
    hasSecret: target.encryptedSecret !== null,
    id: target.id,
    kind: target.kind,
    name: target.name,
    ownerUserId: target.ownerUserId,
    updatedAt: target.updatedAt,
    workspaceId: target.workspaceId
  });
}
