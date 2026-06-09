import { z } from "zod";

import { workspaceIdSchema, userIdSchema } from "./conversation.js";
import { messageIdSchema } from "./message.js";

export const visualWorkflowStatusSchema = z.enum([
  "canceled",
  "preview",
  "running",
  "succeeded",
  "failed"
]);

export const visualWorkflowRunStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed"
]);

export const visualWorkflowNodeStatusSchema = z.enum([
  "waiting",
  "running",
  "succeeded",
  "failed"
]);

export const visualWorkflowNodeTypeSchema = z.enum([
  "input",
  "collection",
  "outline",
  "html_generation",
  "qa",
  "output"
]);

export const visualWorkflowPortSchema = z.object({
  description: z.string().min(1).optional(),
  key: z.string().min(1),
  label: z.string().min(1),
  mimeType: z.string().min(1).optional(),
  placeholder: z.string().min(1).optional(),
  required: z.boolean().default(true)
});

export const visualWorkflowNodeSchema = z.object({
  id: z.string().min(1),
  inputSummary: z.string().min(1),
  label: z.string().min(1),
  outputSummary: z.string().min(1),
  position: z.object({
    x: z.number(),
    y: z.number()
  }).optional(),
  role: z.string().min(1),
  type: visualWorkflowNodeTypeSchema
});

export const visualWorkflowEdgeSchema = z.object({
  from: z.string().min(1),
  id: z.string().min(1),
  label: z.string().min(1).optional(),
  to: z.string().min(1)
});

export const visualWorkflowDefinitionSchema = z.object({
  edges: z.array(visualWorkflowEdgeSchema),
  inputSchema: z.array(visualWorkflowPortSchema),
  nodes: z.array(visualWorkflowNodeSchema),
  outputSchema: z.array(visualWorkflowPortSchema)
});

export const visualWorkflowRunNodeStateSchema = z.object({
  completedAt: z.coerce.date().nullable().default(null),
  error: z.string().nullable().default(null),
  nodeId: z.string().min(1),
  startedAt: z.coerce.date().nullable().default(null),
  status: visualWorkflowNodeStatusSchema
});

export const visualWorkflowRunSchema = z.object({
  completedAt: z.coerce.date().nullable().default(null),
  conversationId: z.string().min(1),
  createdAt: z.coerce.date(),
  error: z.string().nullable().default(null),
  id: z.string().min(1),
  inputValues: z.record(z.string(), z.string()).default({}),
  nodeStates: z.array(visualWorkflowRunNodeStateSchema),
  outputArtifactId: z.string().min(1).nullable().default(null),
  status: visualWorkflowRunStatusSchema,
  updatedAt: z.coerce.date(),
  workflowId: z.string().min(1),
  workspaceId: workspaceIdSchema
});

export const visualWorkflowSchema = z.object({
  conversationId: z.string().min(1),
  createdAt: z.coerce.date(),
  definition: visualWorkflowDefinitionSchema,
  description: z.string().min(1),
  id: z.string().min(1),
  latestRun: visualWorkflowRunSchema.nullable().default(null),
  ownerUserId: userIdSchema,
  sourceMessageId: messageIdSchema,
  status: visualWorkflowStatusSchema,
  title: z.string().min(1),
  updatedAt: z.coerce.date(),
  workspaceId: workspaceIdSchema
});

export const visualWorkflowQuerySchema = z.object({
  channelId: z.string().min(1).optional(),
  workspaceId: workspaceIdSchema.default("default-workspace")
});

export const executeVisualWorkflowInputSchema = z.object({
  inputValues: z.record(z.string(), z.string()).default({}),
  workspaceId: workspaceIdSchema.default("default-workspace")
});

export type ExecuteVisualWorkflowInput = z.infer<typeof executeVisualWorkflowInputSchema>;
export type VisualWorkflow = z.infer<typeof visualWorkflowSchema>;
export type VisualWorkflowDefinition = z.infer<typeof visualWorkflowDefinitionSchema>;
export type VisualWorkflowEdge = z.infer<typeof visualWorkflowEdgeSchema>;
export type VisualWorkflowNode = z.infer<typeof visualWorkflowNodeSchema>;
export type VisualWorkflowRun = z.infer<typeof visualWorkflowRunSchema>;
export type VisualWorkflowRunNodeState = z.infer<typeof visualWorkflowRunNodeStateSchema>;
export type VisualWorkflowRunStatus = z.infer<typeof visualWorkflowRunStatusSchema>;
export type VisualWorkflowStatus = z.infer<typeof visualWorkflowStatusSchema>;
