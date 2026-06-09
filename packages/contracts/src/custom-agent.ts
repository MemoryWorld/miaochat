import { z } from "zod";

import { userIdSchema, workspaceIdSchema } from "./conversation.js";
import { providerIdSchema } from "./database-enums.js";
import { toolBindingSchema } from "./tool-binding.js";

export const customAgentSchema = z.object({
  id: z.string().min(1),
  avatarUrl: z.string().url().nullable().default(null),
  capabilityTags: z.array(z.string().min(1)).default([]),
  name: z.string().min(1).max(80),
  ownerUserId: userIdSchema,
  provider: providerIdSchema,
  modelProfileId: z.string().min(1).nullable().default(null),
  memoryMode: z.enum(["session", "workspace", "workspace_plus_teammate"]).default("workspace_plus_teammate"),
  approvalMode: z.enum(["ask_on_risky", "balanced", "autonomous"]).default("balanced"),
  outputStyle: z.string().min(1).default("清晰、结构化、先给结论再给步骤。"),
  scopeDescription: z.string().nullable().default(null),
  systemPrompt: z.string().min(1),
  toolBindings: z.array(toolBindingSchema).default([]),
  workspaceId: z.string().min(1).default("default-workspace")
});

export const createCustomAgentInputSchema = z.object({
  avatarUrl: z.string().url().nullable().optional(),
  capabilityTags: z.array(z.string().min(1)).default([]),
  name: z.string().trim().min(1).max(80),
  provider: providerIdSchema.default("opencode"),
  modelProfileId: z.string().min(1).nullable().optional(),
  memoryMode: z.enum(["session", "workspace", "workspace_plus_teammate"]).default("workspace_plus_teammate"),
  approvalMode: z.enum(["ask_on_risky", "balanced", "autonomous"]).default("balanced"),
  outputStyle: z.string().trim().min(1).default("清晰、结构化、先给结论再给步骤。"),
  scopeDescription: z.string().trim().min(1).nullable().optional(),
  systemPrompt: z.string().trim().min(1),
  toolBindings: z.array(toolBindingSchema).default([]),
  workspaceId: z.string().min(1).default("default-workspace")
});

export const createChannelTeammateInputSchema = z.object({
  workspaceId: workspaceIdSchema.optional(),
  teammate: createCustomAgentInputSchema.omit({
    workspaceId: true
  })
});

export type CreateCustomAgentInput = z.infer<typeof createCustomAgentInputSchema>;
export type CreateChannelTeammateInput = z.infer<typeof createChannelTeammateInputSchema>;
export type CustomAgent = z.infer<typeof customAgentSchema>;
