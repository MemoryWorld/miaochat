import type { CreateProviderCredentialInput } from "@agenthub/contracts";
import type { CredentialValidationResult } from "@agenthub/domain";

import { validateDeepSeekCredential } from "./deepseek-validator.js";

export async function validateOpenCodeCredential(
  input: CreateProviderCredentialInput
): Promise<CredentialValidationResult> {
  const providerAccountId = input.providerAccountId.trim();
  const rawSecret = input.rawSecret.trim();

  if (providerAccountId.length === 0 || rawSecret.length < 6) {
    return {
      message: "OpenCode 凭证格式不正确，请检查 provider id 和 API Key。",
      providerAccountId,
      valid: false
    };
  }

  // DeepSeek 走真实 API 验证；其他 OpenCode provider（qwen/kimi/glm…）端点各异，
  // 只做格式校验，密钥有效性在首次调用时确认。
  if (providerAccountId.toLowerCase().startsWith("deepseek/")) {
    const model = providerAccountId.slice("deepseek/".length);
    const result = await validateDeepSeekCredential({
      ...input,
      providerAccountId: model,
      rawSecret
    });

    return {
      message: result.message,
      providerAccountId,
      valid: result.valid
    };
  }

  return {
    message: "OpenCode 凭证格式校验通过；密钥有效性将在首次调用时确认。",
    providerAccountId,
    valid: true
  };
}
