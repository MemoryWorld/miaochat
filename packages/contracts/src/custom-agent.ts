import { z } from "zod";

import { providerIdSchema } from "./database-enums.js";
import { toolBindingSchema } from "./tool-binding.js";

export const customAgentSchema = z.object({
  id: z.string().min(1),
  avatarUrl: z.string().url().nullable().default(null),
  capabilityTags: z.array(z.string().min(1)).default([]),
  name: z.string().min(1).max(80),
  provider: providerIdSchema,
  systemPrompt: z.string().min(1),
  toolBindings: z.array(toolBindingSchema).default([]),
  workspaceId: z.string().min(1).default("default-workspace")
});

export const createCustomAgentInputSchema = z.object({
  avatarUrl: z.string().url().nullable().optional(),
  capabilityTags: z.array(z.string().min(1)).default([]),
  name: z.string().trim().min(1).max(80),
  provider: providerIdSchema,
  systemPrompt: z.string().trim().min(1),
  toolBindings: z.array(toolBindingSchema).default([]),
  workspaceId: z.string().min(1).default("default-workspace")
});

export type CreateCustomAgentInput = z.infer<typeof createCustomAgentInputSchema>;
export type CustomAgent = z.infer<typeof customAgentSchema>;
