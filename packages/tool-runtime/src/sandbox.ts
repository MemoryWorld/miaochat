import { type ResourcePolicy, DEFAULT_RESOURCE_POLICY } from "./resource-policy.js";

export type SandboxToolHandler = (input: {
  abortSignal: AbortSignal;
  args: Record<string, unknown>;
  policy: ResourcePolicy;
}) => Promise<unknown>;

export class ToolRuntimeError extends Error {
  readonly publicCode: string;
  readonly retryable: boolean;

  constructor(message: string, publicCode: string, retryable = false) {
    super(message);
    this.name = "ToolRuntimeError";
    this.publicCode = publicCode;
    this.retryable = retryable;
  }
}

export type SandboxRunResult = {
  durationMs: number;
  outputBytes: number;
  result: unknown;
};

export type SandboxObservabilityHook = (event: {
  durationMs: number;
  policy: ResourcePolicy;
  result: "completed" | "failed" | "timed_out";
  toolName: string;
}) => void;

export type RunSandboxedInput = {
  args?: Record<string, unknown>;
  handler: SandboxToolHandler;
  observability?: SandboxObservabilityHook;
  policy?: Partial<ResourcePolicy>;
  toolName: string;
};

/**
 * Runs a server-side tool handler under a resource policy.
 *
 * The implementation enforces the timeout and output-size caps in process so
 * the rest of the API tier can rely on it without spinning up worker
 * threads. CPU and memory caps are advisory at this layer — the sandbox
 * surfaces them to the handler via the `policy` argument so callers can
 * abort early. Callers running untrusted code are expected to pair this
 * helper with a worker_threads or container-level sandbox.
 */
export async function runSandboxed(input: RunSandboxedInput): Promise<SandboxRunResult> {
  const policy: ResourcePolicy = { ...DEFAULT_RESOURCE_POLICY, ...input.policy };
  const controller = new AbortController();
  const start = Date.now();

  const timer = setTimeout(() => {
    controller.abort();
  }, policy.timeoutMs);

  let result: unknown;
  try {
    result = await Promise.race([
      input.handler({
        abortSignal: controller.signal,
        args: input.args ?? {},
        policy
      }),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener("abort", () => {
          reject(
            new ToolRuntimeError(
              `Tool ${input.toolName} timed out after ${policy.timeoutMs}ms.`,
              "tool_timeout",
              true
            )
          );
        });
      })
    ]);
  } catch (error) {
    const durationMs = Date.now() - start;
    const timedOut = controller.signal.aborted;
    input.observability?.({
      durationMs,
      policy,
      result: timedOut ? "timed_out" : "failed",
      toolName: input.toolName
    });

    if (timedOut) {
      throw new ToolRuntimeError(
        `Tool ${input.toolName} timed out after ${policy.timeoutMs}ms.`,
        "tool_timeout",
        true
      );
    }
    if (error instanceof ToolRuntimeError) {
      throw error;
    }
    throw new ToolRuntimeError(
      error instanceof Error ? error.message : String(error),
      "tool_failed",
      false
    );
  } finally {
    clearTimeout(timer);
  }

  const durationMs = Date.now() - start;
  const serialized =
    typeof result === "string" ? result : JSON.stringify(result ?? null);
  const outputBytes = Buffer.byteLength(serialized, "utf8");

  if (outputBytes > policy.maxOutputBytes) {
    input.observability?.({
      durationMs,
      policy,
      result: "failed",
      toolName: input.toolName
    });
    throw new ToolRuntimeError(
      `Tool ${input.toolName} produced ${outputBytes} bytes, exceeds policy cap of ${policy.maxOutputBytes}.`,
      "tool_output_too_large"
    );
  }

  input.observability?.({
    durationMs,
    policy,
    result: "completed",
    toolName: input.toolName
  });

  return {
    durationMs,
    outputBytes,
    result
  };
}
