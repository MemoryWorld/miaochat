import type { CreateProviderCredentialInput } from "@agenthub/contracts";
import type { CredentialValidationResult } from "@agenthub/domain";

export function validateByPrefix(
  input: CreateProviderCredentialInput,
  prefixes: string[]
): CredentialValidationResult {
  const valid = prefixes.some((prefix) => input.rawSecret.startsWith(prefix));

  return {
    message: valid
      ? "模型连接格式验证通过。"
      : "模型连接格式不正确，请检查密钥配置。",
    providerAccountId: input.providerAccountId,
    valid
  };
}
