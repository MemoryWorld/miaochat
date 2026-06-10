export type PublicErrorCode =
  | "credential_invalid"
  | "internal"
  | "missing_runtime"
  | "not_found"
  | "provider_failed"
  | "provider_timeout"
  | "quota_exceeded"
  | "rate_limited"
  | "validation"
  | "workspace_unauthorized";

export type PublicError = {
  code: PublicErrorCode;
  message: string;
  retryAfterMs?: number;
  status: number;
};

export type PublicErrorOptions = {
  retryAfterMs?: number;
  source?: unknown;
};

const catalog: Record<PublicErrorCode, Omit<PublicError, "retryAfterMs">> = {
  credential_invalid: {
    code: "credential_invalid",
    message: "Provider credential could not be used. Re-validate it in the setup flow.",
    status: 400
  },
  internal: {
    code: "internal",
    message: "Something went wrong on our side. Try again in a moment.",
    status: 500
  },
  missing_runtime: {
    code: "missing_runtime",
    message: "The configured agent runtime is not available. Check the worker runtime setup.",
    status: 503
  },
  not_found: {
    code: "not_found",
    message: "The requested resource could not be found in this workspace.",
    status: 404
  },
  provider_failed: {
    code: "provider_failed",
    message: "The provider returned an error before completing the response.",
    status: 502
  },
  provider_timeout: {
    code: "provider_timeout",
    message: "The provider did not respond in time. Try the request again.",
    status: 504
  },
  quota_exceeded: {
    code: "quota_exceeded",
    message: "This workspace exhausted its platform-managed quota for the current period.",
    status: 429
  },
  rate_limited: {
    code: "rate_limited",
    message:
      "This conversation is sending messages too quickly. Wait a moment before sending another.",
    status: 429
  },
  validation: {
    code: "validation",
    message: "The request payload was rejected by validation.",
    status: 400
  },
  workspace_unauthorized: {
    code: "workspace_unauthorized",
    message: "This workspace is not allowed to perform that action.",
    status: 403
  }
};

export function buildPublicError(
  code: PublicErrorCode,
  options: PublicErrorOptions = {}
): PublicError {
  const base = catalog[code];

  return {
    ...base,
    ...(options.retryAfterMs === undefined
      ? {}
      : { retryAfterMs: options.retryAfterMs })
  };
}

export function mapToPublicError(error: unknown): PublicError {
  if (typeof error === "object" && error !== null) {
    const candidate = error as { code?: unknown; message?: unknown; name?: unknown };
    const code = typeof candidate.code === "string" ? candidate.code : undefined;
    const message =
      typeof candidate.message === "string" ? candidate.message.toLowerCase() : "";
    const name =
      typeof candidate.name === "string" ? candidate.name.toLowerCase() : "";

    if (code === "rate_limited" || message.includes("rate limit")) {
      return buildPublicError("rate_limited");
    }

    if (code === "quota_exceeded" || message.includes("quota exceeded")) {
      return buildPublicError("quota_exceeded");
    }

    if (
      code === "credential_invalid" ||
      message.includes("credential validation failed") ||
      message.includes("invalid credential")
    ) {
      return buildPublicError("credential_invalid");
    }

    if (code === "validation" || name.includes("zod") || message.includes("validation")) {
      return buildPublicError("validation");
    }

    if (code === "missing_runtime" || message.includes("missing runtime")) {
      return buildPublicError("missing_runtime");
    }

    if (
      code === "provider_timeout" ||
      message.includes("timed out") ||
      message.includes("timeout")
    ) {
      return buildPublicError("provider_timeout");
    }

    if (
      code === "provider_failed" ||
      message.includes("provider error") ||
      message.includes("upstream error") ||
      message.includes("dispatch failed")
    ) {
      return buildPublicError("provider_failed");
    }

    if (code === "not_found" || message.includes("not found")) {
      return buildPublicError("not_found");
    }

    if (code === "workspace_unauthorized" || message.includes("not allowed")) {
      return buildPublicError("workspace_unauthorized");
    }
  }

  return buildPublicError("internal");
}
