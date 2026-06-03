import type { CreateProviderCredentialInput } from "@agenthub/contracts";
import type { CredentialValidationResult } from "@agenthub/domain";

import { validateByPrefix } from "./shared.js";

export async function validateClaudeCodeCredential(
  input: CreateProviderCredentialInput
): Promise<CredentialValidationResult> {
  return validateByPrefix(input, ["anthropic_", "claude_", "sk-ant-"]);
}
