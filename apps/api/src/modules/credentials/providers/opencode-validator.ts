import type { CreateProviderCredentialInput } from "@agenthub/contracts";
import type { CredentialValidationResult } from "@agenthub/domain";

export async function validateOpenCodeCredential(
  input: CreateProviderCredentialInput
): Promise<CredentialValidationResult> {
  const providerAccountId = input.providerAccountId.trim();
  const rawSecret = input.rawSecret.trim();
  const valid = providerAccountId.length > 0 && rawSecret.length >= 6;

  return {
    message: valid
      ? "OpenCode 凭证格式验证通过。"
      : "OpenCode 凭证格式不正确，请检查 provider id 和 API Key。",
    providerAccountId,
    valid
  };
}
