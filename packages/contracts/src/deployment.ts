import { z } from "zod";

import { userIdSchema, workspaceIdSchema } from "./conversation.js";
import {
  deployTargetKindSchema,
  deploymentStatusSchema
} from "./database-enums.js";

export const deploymentProgressEventSchema = z.object({
  at: z.string().datetime(),
  label: z.enum([
    "deployment.received",
    "deployment.running",
    "deployment.completed",
    "deployment.failed"
  ]),
  message: z.string().min(1),
  metadata: z.record(z.unknown()).default({}),
  status: deploymentStatusSchema
});

export const deploymentSchema = z.object({
  artifactId: z.string().min(1),
  completedAt: z.coerce.date().nullable().default(null),
  createdAt: z.coerce.date(),
  deployTargetId: z.string().min(1),
  errorMessage: z.string().nullable().default(null),
  id: z.string().min(1),
  ownerUserId: userIdSchema,
  previewUrl: z.string().min(1).nullable().default(null),
  progressEvents: z.array(deploymentProgressEventSchema).default([]),
  resultMessage: z.string().min(1),
  startedAt: z.coerce.date(),
  status: deploymentStatusSchema,
  targetKind: deployTargetKindSchema,
  updatedAt: z.coerce.date(),
  workspaceId: workspaceIdSchema
});

export type Deployment = z.infer<typeof deploymentSchema>;
export type DeploymentProgressEvent = z.infer<typeof deploymentProgressEventSchema>;
