import { z } from "zod";

export const toolBindingSchema = z.object({
  configPath: z.string().min(1).nullable().default(null),
  name: z.string().min(1),
  runtime: z.enum(["config_file", "server_registration"])
});

export type ToolBinding = z.infer<typeof toolBindingSchema>;
