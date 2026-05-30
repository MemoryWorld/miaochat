const apiErrorTranslations: Record<string, string> = {
  "Authentication is required.": "请先登录后再继续操作。",
  "Invalid email or password.": "邮箱或密码不正确。"
};

export function readApiErrorMessage(payload: unknown, fallback: string): string {
  if (
    payload &&
    typeof payload === "object" &&
    "message" in payload &&
    typeof (payload as { message?: unknown }).message === "string"
  ) {
    return translateApiErrorMessage((payload as { message: string }).message);
  }

  return fallback;
}

export function translateApiErrorMessage(message: string): string {
  return apiErrorTranslations[message] ?? message;
}
