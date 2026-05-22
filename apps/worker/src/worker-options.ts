import { fileURLToPath } from "node:url";

import type { NativeConnectionOptions, WorkerOptions } from "@temporalio/worker";

export function createConnectionOptions(): NativeConnectionOptions {
  return {
    address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233"
  };
}

export function createWorkerOptions(): WorkerOptions {
  return {
    activities: awaitableActivities,
    taskQueue: process.env.WORKER_TASK_QUEUE ?? "agenthub-default",
    workflowsPath: fileURLToPath(new URL("./workflows/index.ts", import.meta.url))
  };
}

const awaitableActivities = {
  aggregateResultsActivity: async (input: unknown) => {
    const { aggregateResultsActivity } = await import("./activities/index.js");
    return aggregateResultsActivity(input as never);
  },
  deployContainerActivity: async (input: unknown) => {
    const { deployContainerActivity } = await import("./activities/index.js");
    return deployContainerActivity(input as never);
  },
  deployStaticSiteActivity: async (input: unknown) => {
    const { deployStaticSiteActivity } = await import("./activities/index.js");
    return deployStaticSiteActivity(input as never);
  },
  finalizeDeployActivity: async (input: unknown) => {
    const { finalizeDeployActivity } = await import("./activities/index.js");
    return finalizeDeployActivity(input as never);
  },
  executeDirectAgentActivity: async (input: unknown) => {
    const { executeDirectAgentActivity } = await import("./activities/index.js");
    return executeDirectAgentActivity(input as never);
  },
  dispatchAgentActivity: async (input: unknown) => {
    const { dispatchAgentActivity } = await import("./activities/index.js");
    return dispatchAgentActivity(input as never);
  },
  placeholderActivity: async (input: string) => {
    const { placeholderActivity } = await import("./activities/index.js");
    return placeholderActivity(input);
  },
  prepareDeployActivity: async (input: unknown) => {
    const { prepareDeployActivity } = await import("./activities/index.js");
    return prepareDeployActivity(input as never);
  }
};
