import { Writable } from "node:stream";

import { describe, expect, it } from "vitest";
import {
  MemoryErrorCaptureSink,
  getGlobalErrorContextStore
} from "@agenthub/observability-errors";

import { ErrorReporterService } from "../src/observability/error-reporter.service.js";
import { StructuredLogger } from "../src/observability/structured-logger.service.js";

class CapturingStream extends Writable {
  readonly entries: string[] = [];

  override _write(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ): void {
    this.entries.push(chunk.toString("utf8"));
    callback();
  }
}

describe("api error reporter", () => {
  it("forwards unhandled errors with workspace, conversation, and trace context", async () => {
    const sink = new MemoryErrorCaptureSink();
    const stream = new CapturingStream();
    const logger = new StructuredLogger({
      serviceName: "api-test",
      stream
    });
    const reporter = new ErrorReporterService(
      logger,
      sink,
      getGlobalErrorContextStore()
    );

    await getGlobalErrorContextStore().run(
      {
        conversationId: "conv_error_1",
        traceId: "trace_error_1",
        workspaceId: "ws_error_1"
      },
      async () => {
        await reporter.captureUnhandled(new Error("boom"), {
          route: "/messages/send",
          runtime: "api"
        });
      }
    );

    expect(sink.events).toEqual([
      expect.objectContaining({
        context: expect.objectContaining({
          conversationId: "conv_error_1",
          route: "/messages/send",
          runtime: "api",
          traceId: "trace_error_1",
          workspaceId: "ws_error_1"
        }),
        error: expect.objectContaining({
          message: "boom",
          name: "Error"
        })
      })
    ]);

    expect(stream.entries.join("")).toContain("\"event\":\"error.capture.forwarded\"");
  });
});
