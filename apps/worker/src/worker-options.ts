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
  placeholderActivity: async (input: string) => {
    const { placeholderActivity } = await import("./activities/index.js");
    return placeholderActivity(input);
  }
};
