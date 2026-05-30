import { z } from "zod";

import { workspaceIdSchema } from "./conversation.js";

export const skillStatusSchema = z.enum([
  "active",
  "disabled",
  "planned"
]);

export const skillBindingSchema = z.object({
  category: z.string().min(1),
  id: z.string().min(1),
  name: z.string().min(1),
  runtimeBackendIds: z.array(z.string().min(1)).default([]),
  status: skillStatusSchema,
  summary: z.string().min(1),
  teammateIds: z.array(z.string().min(1)).default([]),
  workspaceEnabled: z.boolean().default(true),
  workspaceId: workspaceIdSchema
});

export type SkillBinding = z.infer<typeof skillBindingSchema>;
export type SkillStatus = z.infer<typeof skillStatusSchema>;
