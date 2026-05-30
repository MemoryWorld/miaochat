import { AgentAdapterError } from "@agenthub/agent-sdk";
import { ApplicationFailure } from "@temporalio/client";

export class ProviderCredentialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderCredentialError";
  }
}

export function toTemporalActivityFailure(error: unknown): unknown {
  if (error instanceof ApplicationFailure) {
    return error;
  }

  if (error instanceof ProviderCredentialError) {
    return ApplicationFailure.nonRetryable(error.message, error.name);
  }

  if (error instanceof AgentAdapterError && !error.retryable) {
    return ApplicationFailure.nonRetryable(error.message, error.name, {
      code: error.code
    });
  }

  return error;
}
