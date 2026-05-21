import { z } from "zod";

import { providerIdSchema } from "./database-enums.js";

export const orchestratorStatusLabelSchema = z.enum([
  "orchestrator.aggregated",
  "orchestrator.dispatched",
  "orchestrator.partial_failure",
  "orchestrator.received",
  "orchestrator.running"
]);

export const orchestratorFailureCodeSchema = z.enum([
  "error",
  "timeout"
]);

export const orchestratorFailureSchema = z.object({
  agentId: z.string().min(1),
  agentName: z.string().min(1),
  code: orchestratorFailureCodeSchema,
  detail: z.string().min(1),
  provider: providerIdSchema
});

export const orchestratorStatusStateSchema = z.enum([
  "failed",
  "running",
  "succeeded"
]);

export const orchestratorStatusEventPayloadSchema = z.object({
  failures: z.array(orchestratorFailureSchema).default([]),
  label: orchestratorStatusLabelSchema,
  state: orchestratorStatusStateSchema,
  successfulAgentCount: z.number().int().nonnegative(),
  summary: z.string().min(1).optional(),
  totalAgentCount: z.number().int().positive()
});

export type OrchestratorFailure = z.infer<typeof orchestratorFailureSchema>;
export type OrchestratorFailureCode = z.infer<typeof orchestratorFailureCodeSchema>;
export type OrchestratorStatusEventPayload = z.infer<
  typeof orchestratorStatusEventPayloadSchema
>;
export type OrchestratorStatusLabel = z.infer<typeof orchestratorStatusLabelSchema>;
