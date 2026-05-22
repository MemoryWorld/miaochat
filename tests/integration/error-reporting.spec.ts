import { describe, expect, it } from "vitest";
import {
  MemoryErrorCaptureSink,
  getGlobalErrorContextStore,
  resetGlobalErrorCaptureSink,
  setGlobalErrorCaptureSink
} from "../../packages/observability-errors/src/index.js";

import {
  bindWorkerUnhandledErrors,
  resetWorkerObservability
} from "../../apps/worker/src/observability/observability.js";

describe("error reporting integration", () => {
  it("captures worker unhandled exceptions with active trace context", async () => {
    const sink = new MemoryErrorCaptureSink();
    setGlobalErrorCaptureSink(sink);

    const unbind = bindWorkerUnhandledErrors();

    try {
      const error = new Error("worker boom");

      getGlobalErrorContextStore().run(
        {
          conversationId: "conv_worker_1",
          traceId: "trace_worker_1",
          workspaceId: "ws_worker_1"
        },
        () => {
          process.emit("uncaughtExceptionMonitor", error, "uncaughtException");
        }
      );

      await Promise.resolve();

      expect(sink.events).toEqual([
        expect.objectContaining({
          context: expect.objectContaining({
            conversationId: "conv_worker_1",
            kind: "uncaughtException",
            runtime: "worker",
            traceId: "trace_worker_1",
            workspaceId: "ws_worker_1"
          }),
          error: expect.objectContaining({
            message: "worker boom",
            name: "Error"
          })
        })
      ]);
    } finally {
      unbind();
      resetWorkerObservability();
      resetGlobalErrorCaptureSink();
    }
  });
});
