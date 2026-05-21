export class AgentAdapterError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(message: string, options?: { code?: string; retryable?: boolean }) {
    super(message);
    this.code = options?.code ?? "adapter_error";
    this.name = "AgentAdapterError";
    this.retryable = options?.retryable ?? false;
  }
}

export function normalizeAdapterError(error: unknown): AgentAdapterError {
  if (error instanceof AgentAdapterError) {
    return error;
  }

  if (error instanceof Error) {
    return new AgentAdapterError(error.message);
  }

  return new AgentAdapterError("Unknown adapter error");
}
