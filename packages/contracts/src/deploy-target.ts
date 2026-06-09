import { z } from "zod";

import { userIdSchema, workspaceIdSchema } from "./conversation.js";
import {
  credentialSourceSchema,
  deployTargetKindSchema
} from "./database-enums.js";

const deployProjectNameSchema = z.string().trim().min(1).max(80).regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/, {
  message: "Project and app names may contain lowercase letters, numbers, and hyphens."
});

export const vercelStaticSiteDeployConfigSchema = z.object({
  pollIntervalMs: z.number().int().min(500).max(10_000).default(2_000),
  pollTimeoutMs: z.number().int().min(10_000).max(600_000).default(180_000),
  projectName: deployProjectNameSchema.optional(),
  provider: z.literal("vercel"),
  teamId: z.string().trim().min(1).max(120).optional(),
  target: z.enum(["preview", "production"]).default("preview")
});

export const flyContainerDeployConfigSchema = z.object({
  allocateSharedIpv4: z.boolean().default(true),
  appName: deployProjectNameSchema.optional(),
  guestMemoryMb: z.number().int().min(256).max(2_048).default(256),
  machineImage: z.string().trim().min(1).max(200).default("nginx:1.27-alpine"),
  orgSlug: z.string().trim().min(1).max(80).default("personal"),
  provider: z.literal("fly"),
  region: z.string().trim().min(3).max(12).default("syd")
});

export const s3SourceArchiveDeployConfigSchema = z.object({
  bucket: z.string().trim().min(1).max(120).optional(),
  provider: z.literal("s3-compatible"),
  publicBaseUrl: z.string().trim().url(),
  storagePrefix: z.string().trim().min(1).max(240).default("deployments/source-archives")
});

export const deployTargetProviderConfigSchema = z.union([
  vercelStaticSiteDeployConfigSchema,
  flyContainerDeployConfigSchema,
  s3SourceArchiveDeployConfigSchema
]);

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

export function parseDeployTargetProviderConfig(
  kind: z.infer<typeof deployTargetKindSchema>,
  config: Record<string, unknown>
): DeployTargetProviderConfig {
  switch (kind) {
    case "static-site":
      return vercelStaticSiteDeployConfigSchema.parse(config);
    case "container":
      return flyContainerDeployConfigSchema.parse(config);
    case "source-archive":
      return s3SourceArchiveDeployConfigSchema.parse(config);
  }
}

export type DeployTarget = z.infer<typeof deployTargetSchema>;
export type DeployTargetProviderConfig = z.infer<typeof deployTargetProviderConfigSchema>;
export type FlyContainerDeployConfig = z.infer<typeof flyContainerDeployConfigSchema>;
export type S3SourceArchiveDeployConfig = z.infer<typeof s3SourceArchiveDeployConfigSchema>;
export type VercelStaticSiteDeployConfig = z.infer<typeof vercelStaticSiteDeployConfigSchema>;
export type CreateDeployTargetInput = z.infer<typeof createDeployTargetInputSchema>;
