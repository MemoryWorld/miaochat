const runtimeWrapperMessagePattern = /^(workflow execution failed|activity task failed)$/iu;

export function formatRuntimeFailureReason(error: unknown): string {
  const code = extractRuntimeFailureCode(error);
  const message = extractRuntimeFailureMessage(error) ?? "";

  if (code === "missing_runtime" || isMissingOpenCodeRuntimeMessage(message)) {
    return "OpenCode 运行时不可用：OpenCode CLI 未安装或 Worker PATH 不可见，请安装 OpenCode 并重启 Worker。";
  }

  if (code === "worker_unavailable" || isWorkerUnavailableMessage(message)) {
    return "Worker 未启动或未连接到 agenthub-default 队列，请启动 worker 后重试。";
  }

  return message || "未知错误";
}

function extractRuntimeFailureCode(error: unknown, depth = 0): string | null {
  if (depth > 8 || error === null || error === undefined) {
    return null;
  }

  if (Array.isArray(error)) {
    for (const item of error) {
      const nested = extractRuntimeFailureCode(item, depth + 1);

      if (nested) {
        return nested;
      }
    }

    return null;
  }

  if (typeof error !== "object") {
    return null;
  }

  const record = error as Record<string, unknown>;
  const code = typeof record.code === "string" ? record.code.trim().toLowerCase() : "";

  if (code) {
    return code;
  }

  for (const key of ["cause", "failure", "details", "error"] as const) {
    const nested = extractRuntimeFailureCode(record[key], depth + 1);

    if (nested) {
      return nested;
    }
  }

  return null;
}

function extractRuntimeFailureMessage(error: unknown, depth = 0): string | null {
  if (depth > 8 || error === null || error === undefined) {
    return null;
  }

  if (typeof error === "string") {
    return error.trim() || null;
  }

  if (Array.isArray(error)) {
    for (const item of error) {
      const nested = extractRuntimeFailureMessage(item, depth + 1);

      if (nested) {
        return nested;
      }
    }

    return null;
  }

  if (typeof error !== "object") {
    return String(error);
  }

  const record = error as Record<string, unknown>;
  const nested =
    extractRuntimeFailureMessage(record.cause, depth + 1) ??
    extractRuntimeFailureMessage(record.failure, depth + 1) ??
    extractRuntimeFailureMessage(record.details, depth + 1) ??
    extractRuntimeFailureMessage(record.error, depth + 1);
  const message =
    typeof record.message === "string" && record.message.trim().length > 0
      ? record.message.trim()
      : null;

  if (!message) {
    return nested;
  }

  if (nested && runtimeWrapperMessagePattern.test(message)) {
    return nested;
  }

  return nested && nested !== message ? `${message}: ${nested}` : message;
}

function isMissingOpenCodeRuntimeMessage(message: string): boolean {
  return /spawn opencode ENOENT|opencode.*not found|opencode cli.*path|missing_runtime/i.test(
    message
  );
}

function isWorkerUnavailableMessage(message: string): boolean {
  return /no worker|poller|task queue|deadline exceeded|connection refused/i.test(message);
}
