import { z } from "zod";

import {
  runtimeBackendSchema,
  type BuiltInCodingRole,
  type RuntimeBackend
} from "./coding-workflow.js";

export const executionPlaneSchema = z.enum([
  "deferred_remote",
  "in_process",
  "isolated_workspace"
]);

export const executionPlaneAudienceSchema = z.enum([
  "fallback",
  "planning",
  "qa",
  "review",
  "workspace_execution"
]);

export const executionPlaneBindingSchema = z.object({
  audience: executionPlaneAudienceSchema,
  executionPlane: executionPlaneSchema,
  runtimeBackend: runtimeBackendSchema,
  summary: z.string().min(1)
});

export type ExecutionPlane = z.infer<typeof executionPlaneSchema>;
export type ExecutionPlaneAudience = z.infer<typeof executionPlaneAudienceSchema>;
export type ExecutionPlaneBinding = z.infer<typeof executionPlaneBindingSchema>;

export function resolveBuiltInExecutionPlane(role: BuiltInCodingRole): ExecutionPlane {
  switch (role) {
    case "tech_lead":
    case "code_reviewer":
      return "in_process";
    case "software_engineer":
    case "qa_tester":
      return "isolated_workspace";
  }
}

export function buildExecutionPlaneBinding(input: {
  role: BuiltInCodingRole;
  runtimeBackend: RuntimeBackend;
}): ExecutionPlaneBinding {
  const executionPlane = resolveBuiltInExecutionPlane(input.role);

  return executionPlaneBindingSchema.parse({
    audience: resolveExecutionPlaneAudience(input.role),
    executionPlane,
    runtimeBackend: input.runtimeBackend,
    summary:
      executionPlane === "in_process"
        ? "面向计划与评审的轻量执行平面，强调快速协作和低成本上下文切换。"
        : "面向实现与验证的隔离工作区执行平面，强调代码、测试和产物边界。"
  });
}

function resolveExecutionPlaneAudience(role: BuiltInCodingRole): ExecutionPlaneAudience {
  switch (role) {
    case "tech_lead":
      return "planning";
    case "code_reviewer":
      return "review";
    case "qa_tester":
      return "qa";
    case "software_engineer":
      return "workspace_execution";
  }
}
