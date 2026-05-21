import type { CreateProviderCredentialInput } from "@agenthub/contracts";
import type { CredentialValidationResult } from "@agenthub/domain";

export function validateByPrefix(
  input: CreateProviderCredentialInput,
  providerName: string,
  prefixes: string[]
): CredentialValidationResult {
  const valid = prefixes.some((prefix) => input.rawSecret.startsWith(prefix));
  const expectedPrefixes = prefixes.join(", ");

  return {
    message: valid
      ? `${providerName} credential passed local format validation.`
      : `${providerName} credential must start with one of: ${expectedPrefixes}.`,
    providerAccountId: input.providerAccountId,
    valid
  };
}
