import { z } from "zod";

import { userIdSchema, workspaceIdSchema } from "./conversation.js";
import {
  credentialSourceSchema,
  deployTargetKindSchema
} from "./database-enums.js";

export const deployTargetSchema = z.object({
  config: z.record(z.unknown()).default({}),
  createdAt: z.coerce.date(),
  credentialSource: credentialSourceSchema.default("user_provided"),
  encryptedSecret: z.string().min(1).nullable().default(null),
  id: z.string().min(1),
  kind: deployTargetKindSchema,
  name: z.string().min(1).max(120),
  ownerUserId: userIdSchema,
  updatedAt: z.coerce.date(),
  workspaceId: workspaceIdSchema
});

export const createDeployTargetInputSchema = z
  .object({
    config: z.record(z.unknown()).default({}),
    credentialSource: credentialSourceSchema.default("user_provided"),
    kind: deployTargetKindSchema,
    name: z.string().trim().min(1).max(120),
    rawSecret: z.string().trim().min(1).optional(),
    workspaceId: workspaceIdSchema.optional()
  })
  .superRefine((value, context) => {
    if (value.credentialSource === "platform_managed" && value.rawSecret) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Platform-managed deploy targets cannot accept rawSecret.",
        path: ["rawSecret"]
      });
    }
  });

export type DeployTarget = z.infer<typeof deployTargetSchema>;
export type CreateDeployTargetInput = z.infer<typeof createDeployTargetInputSchema>;
