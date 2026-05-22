import { Inject, Injectable } from "@nestjs/common";
import {
  createCapturedError,
  getGlobalErrorCaptureSink,
  getGlobalErrorContextStore,
  type ErrorCaptureContext,
  type ErrorCaptureSink,
  type ErrorContextStore
} from "@agenthub/observability-errors";

import { StructuredLogger } from "./structured-logger.service.js";

@Injectable()
export class ErrorReporterService {
  constructor(
    @Inject(StructuredLogger) private readonly logger: StructuredLogger,
    private readonly sink: ErrorCaptureSink = getGlobalErrorCaptureSink(),
    private readonly contextStore: ErrorContextStore = getGlobalErrorContextStore()
  ) {}

  async captureUnhandled(
    error: unknown,
    context: ErrorCaptureContext = {}
  ): Promise<void> {
    const payload = createCapturedError(error, {
      ...this.contextStore.snapshot(),
      ...context
    });

    await this.sink.capture(payload);
    this.logger.error("error.capture.forwarded", {
      ...payload.context,
      errorMessage: payload.error.message,
      errorName: payload.error.name
    });
  }
}
