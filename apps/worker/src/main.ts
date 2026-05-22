import { fileURLToPath } from "node:url";

import { NativeConnection, Worker } from "@temporalio/worker";

import { bindWorkerUnhandledErrors } from "./observability/observability.js";
import { createConnectionOptions, createWorkerOptions } from "./worker-options.js";

export async function bootstrapWorker(): Promise<Worker> {
  const connection = await NativeConnection.connect(createConnectionOptions());
  return Worker.create({
    ...createWorkerOptions(),
    connection
  });
}

async function main(): Promise<void> {
  bindWorkerUnhandledErrors();
  const worker = await bootstrapWorker();
  await worker.run();
}

if (process.env.NODE_ENV !== "test") {
  const entryFile = process.argv[1];
  const isMainModule =
    typeof entryFile === "string" && fileURLToPath(import.meta.url) === entryFile;

  if (isMainModule) {
    main().catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
  }
}
