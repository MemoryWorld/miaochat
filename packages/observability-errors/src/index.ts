import { AsyncLocalStorage } from "node:async_hooks";

export type ErrorCaptureContext = Record<string, unknown> & {
  conversationId?: string;
  traceId?: string;
  workspaceId?: string;
};

export type CapturedError = {
  context: ErrorCaptureContext;
  error: {
    message: string;
    name: string;
    stack?: string;
  };
  reportedAt: string;
};

export interface ErrorCaptureSink {
  capture(error: CapturedError): void | Promise<void>;
}

export class MemoryErrorCaptureSink implements ErrorCaptureSink {
  readonly events: CapturedError[] = [];

  capture(error: CapturedError): void {
    this.events.push(error);
  }

  reset(): void {
    this.events.length = 0;
  }
}

class NoopErrorCaptureSink implements ErrorCaptureSink {
  capture(): void {}
}

export class ErrorContextStore {
  private readonly storage = new AsyncLocalStorage<ErrorCaptureContext>();

  enterWith(context: ErrorCaptureContext): void {
    this.storage.enterWith({
      ...(this.storage.getStore() ?? {}),
      ...context
    });
  }

  run<T>(context: ErrorCaptureContext, callback: () => T): T {
    return this.storage.run(
      {
        ...(this.storage.getStore() ?? {}),
        ...context
      },
      callback
    );
  }

  snapshot(): ErrorCaptureContext {
    return {
      ...(this.storage.getStore() ?? {})
    };
  }
}

const noopSink = new NoopErrorCaptureSink();
const globalContextStore = new ErrorContextStore();

let activeSink: ErrorCaptureSink = noopSink;

export function getGlobalErrorCaptureSink(): ErrorCaptureSink {
  return activeSink;
}

export function setGlobalErrorCaptureSink(sink: ErrorCaptureSink): void {
  activeSink = sink;
}

export function resetGlobalErrorCaptureSink(): void {
  activeSink = noopSink;
}

export function getGlobalErrorContextStore(): ErrorContextStore {
  return globalContextStore;
}

export function createCapturedError(
  error: unknown,
  context: ErrorCaptureContext = {}
): CapturedError {
  const normalized = normalizeError(error);

  return {
    context,
    error: normalized,
    reportedAt: new Date().toISOString()
  };
}

export function normalizeError(error: unknown): CapturedError["error"] {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack
    };
  }

  return {
    message: String(error),
    name: "NonErrorThrowable"
  };
}

export function bindUnhandledErrorMonitors(
  onError: (error: unknown, context: ErrorCaptureContext) => void
): () => void {
  const onUncaughtException = (error: Error) => {
    onError(error, {
      kind: "uncaughtException"
    });
  };
  const onUnhandledRejection = (reason: unknown) => {
    onError(reason, {
      kind: "unhandledRejection"
    });
  };

  process.on("uncaughtExceptionMonitor", onUncaughtException);
  process.on("unhandledRejection", onUnhandledRejection);

  return () => {
    process.off("uncaughtExceptionMonitor", onUncaughtException);
    process.off("unhandledRejection", onUnhandledRejection);
  };
}
