import { z } from "zod";

import { artifactSchema } from "./artifact.js";
import { conversationIdSchema, workspaceIdSchema } from "./conversation.js";
import { credentialSourceSchema, deployTargetKindSchema } from "./database-enums.js";
import { deploymentSchema } from "./deployment.js";

export const deployCommandInputSchema = z.object({
  conversationId: conversationIdSchema,
  targetName: z.string().trim().min(1).max(120),
  workspaceId: workspaceIdSchema.default("default-workspace")
});

export const deployTargetSummarySchema = z.object({
  credentialSource: credentialSourceSchema,
  hasSecret: z.boolean(),
  id: z.string().min(1),
  kind: deployTargetKindSchema,
  name: z.string().min(1).max(120),
  workspaceId: workspaceIdSchema
});

export const deployCommandResultSchema = z.object({
  artifact: artifactSchema,
  deployment: deploymentSchema,
  target: deployTargetSummarySchema
});

export type DeployCommandInput = z.infer<typeof deployCommandInputSchema>;
export type DeployCommandResult = z.infer<typeof deployCommandResultSchema>;
export type DeployTargetSummary = z.infer<typeof deployTargetSummarySchema>;
