import type { RuntimeBackend } from "@agenthub/contracts";
import type { AgentExecutionMode } from "@agenthub/agent-adapters";

import {
  createPhaseARuntimeExecution,
  type PhaseARuntimeExecution
} from "./provider-runtime.js";

export type InternalRuntimeExecution = PhaseARuntimeExecution & {
  runtimeBackend: RuntimeBackend;
};

export async function createInternalRuntimeExecution(input: {
  executionMode: AgentExecutionMode;
  ownerUserId: string;
  runtimeBackend: RuntimeBackend;
  workspaceId: string;
}): Promise<InternalRuntimeExecution> {
  const provider = resolveRuntimeBackendProvider(input.runtimeBackend);
  const runtime = await createPhaseARuntimeExecution({
    executionMode: input.executionMode,
    ownerUserId: input.ownerUserId,
    provider,
    workspaceId: input.workspaceId
  });

  return {
    ...runtime,
    runtimeBackend: input.runtimeBackend
  };
}

export function resolveRuntimeBackendProvider(runtimeBackend: RuntimeBackend) {
  switch (runtimeBackend) {
    case "enhanced-hermes":
      return "deepseek" as const;
    case "hermes-compat":
      return "hermes" as const;
    case "openclaw-compat":
      return "openclaw" as const;
    case "mock":
      return "mock" as const;
    case "claude-code-internal":
      throw new Error(
        "Runtime backend claude-code-internal is defined by contract only and remains unavailable in this release."
      );
  }
}

export function isBuiltInPreferredRuntime(runtimeBackend: RuntimeBackend): boolean {
  return runtimeBackend === "enhanced-hermes";
}

export function isCompatibilityRuntime(runtimeBackend: RuntimeBackend): boolean {
  return runtimeBackend === "hermes-compat" || runtimeBackend === "openclaw-compat";
}
